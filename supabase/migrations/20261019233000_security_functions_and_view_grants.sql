-- Security follow-up (Oct 19 2026 audit): function EXECUTE grants, ownership
-- transfer caller check, search_path, public view write grants, and calendar
-- sync connection scoping. Idempotent: safe to run more than once.
-- NOTE: DO NOT APPLY TO PRODUCTION until Jonathan gives GO.
-- Independent of 20261019230000_security_signups_rls_and_gcal_safe_view.sql;
-- either can be applied first.
--
-- Supabase's default privileges grant EXECUTE on new public functions to anon
-- and authenticated explicitly, so REVOKE ... FROM PUBLIC alone is not enough.

-- ---------------------------------------------------------------------------
-- (a) transfer_organization_ownership
-- It treated auth.uid() IS NULL as "service role", and an anon-key call also
-- has a NULL uid, so anyone could hand any org to any accepted member (a
-- co-admin could make themselves owner). Now:
--   * a signed-in caller must be the current owner (unchanged)
--   * a NULL uid is allowed only for the service_role JWT, or a direct DB
--     session (SQL editor / migrations) that is not PostgREST's authenticator
--   * anon loses EXECUTE
-- The app calls it only from POST /api/organizations/[id]/transfer with the
-- signed-in owner's session. Invite accept inlines its own transfer logic.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transfer_organization_ownership(p_org_id uuid, p_new_owner_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_current_owner UUID;
    v_caller UUID;
    v_role TEXT;
    v_target_status TEXT;
    v_target_member_id UUID;
    v_old_owner_member_id UUID;
BEGIN
    v_caller := auth.uid();
    v_role := auth.role();

    -- No user id: only the service role, or a direct database session (not the
    -- PostgREST authenticator), may act without being the owner.
    IF v_caller IS NULL
       AND v_role IS DISTINCT FROM 'service_role'
       AND (v_role IS NOT NULL OR session_user = 'authenticator') THEN
        RAISE EXCEPTION 'Only the current owner can transfer ownership'
            USING ERRCODE = '42501';
    END IF;

    SELECT owner_id INTO v_current_owner
    FROM public.organizations
    WHERE id = p_org_id;

    IF v_current_owner IS NULL THEN
        RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002';
    END IF;

    -- Signed-in callers must be the current owner.
    IF v_caller IS NOT NULL AND v_caller <> v_current_owner THEN
        RAISE EXCEPTION 'Only the current owner can transfer ownership'
            USING ERRCODE = '42501';
    END IF;

    IF v_current_owner = p_new_owner_user_id THEN
        RAISE EXCEPTION 'Target user is already the owner'
            USING ERRCODE = '22023';
    END IF;

    -- Target must be an accepted member with a real user_id.
    SELECT id, status INTO v_target_member_id, v_target_status
    FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = p_new_owner_user_id;

    IF v_target_member_id IS NULL THEN
        RAISE EXCEPTION 'Target user is not a member of this organization'
            USING ERRCODE = '22023';
    END IF;
    IF v_target_status <> 'accepted' THEN
        RAISE EXCEPTION 'Target member must accept their invitation first'
            USING ERRCODE = '22023';
    END IF;

    SELECT id INTO v_old_owner_member_id
    FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = v_current_owner
      AND role = 'owner'
      AND status = 'accepted';

    IF v_old_owner_member_id IS NULL THEN
        RAISE EXCEPTION 'Current owner has no owner membership row'
            USING ERRCODE = 'P0002';
    END IF;

    -- Demote first to free the partial unique index (one accepted owner per org),
    -- then promote the target.
    UPDATE public.organization_members
    SET role = 'admin'
    WHERE id = v_old_owner_member_id;

    UPDATE public.organization_members
    SET role = 'owner'
    WHERE id = v_target_member_id;

    UPDATE public.organizations
    SET owner_id = p_new_owner_user_id
    WHERE id = p_org_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.transfer_organization_ownership(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_organization_ownership(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.transfer_organization_ownership(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- (b) server-only SECURITY DEFINER helpers: service role only.
-- Every app caller uses the service-role client (metrics route, rate-limit,
-- email-send, email-deliver, founder-notify, welcome, item-signups).
-- metrics_creator_breakdown returned every organizer email to anon;
-- try_claim_cron_run let anon pre-claim cron buckets and skip reminder runs.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.metrics_creator_breakdown()',
    'public.metrics_creator_breakdown(text)',
    'public.metrics_total_capacity()',
    'public.metrics_total_capacity(text)',
    'public.try_claim_cron_run(text, timestamp with time zone)',
    'public.try_claim_welcome_email(uuid, text)',
    'public.try_insert_creator_signup_notification(text)',
    'public.try_consume_action_rate(text, text, timestamp with time zone, integer)',
    'public.try_consume_signup_rate(text, timestamp with time zone, integer)'
  ]
  LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- (c) pin search_path on the signup RPC the app uses (6-arg overload).
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.create_signup_if_capacity(uuid, uuid, text, text, text, jsonb)
  SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- (d) public signup views are read-only for the public. They join two tables
-- so Postgres already refuses writes; this removes the unused grants.
-- ---------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.signups_public FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.item_signups_public FROM anon, authenticated;
GRANT SELECT ON public.signups_public TO anon, authenticated;
GRANT SELECT ON public.item_signups_public TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- (e) campaign_calendar_sync: a member could insert/update a sync row pointing
-- at any connection id, including another org's Google account. Require the
-- connection to belong to the campaign's org. The helper is SECURITY DEFINER
-- so the check works whatever the caller can see on google_calendar_connections
-- (co-admins toggling sync on the owner's connection keep working).
-- Service-role writes (OAuth callback re-pointing duplicates) bypass RLS.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calendar_connection_matches_campaign_org(p_connection_id uuid, p_campaign_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.google_calendar_connections g
    JOIN public.campaigns c ON c.organization_id = g.organization_id
    WHERE g.id = p_connection_id
      AND c.id = p_campaign_id
  );
$function$;

REVOKE ALL ON FUNCTION public.calendar_connection_matches_campaign_org(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calendar_connection_matches_campaign_org(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Org members can insert campaign calendar sync" ON public.campaign_calendar_sync;
CREATE POLICY "Org members can insert campaign calendar sync"
  ON public.campaign_calendar_sync
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_calendar_sync.campaign_id
        AND public.is_org_member(c.organization_id)
    )
    AND public.calendar_connection_matches_campaign_org(connection_id, campaign_id)
  );

DROP POLICY IF EXISTS "Org members can update campaign calendar sync" ON public.campaign_calendar_sync;
CREATE POLICY "Org members can update campaign calendar sync"
  ON public.campaign_calendar_sync
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_calendar_sync.campaign_id
        AND public.is_org_member(c.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_calendar_sync.campaign_id
        AND public.is_org_member(c.organization_id)
    )
    AND public.calendar_connection_matches_campaign_org(connection_id, campaign_id)
  );
