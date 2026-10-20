-- Dashboard in one round trip (perf, Oct 20 2026).
-- NOTE: DO NOT APPLY TO PRODUCTION until Jonathan gives GO.
-- Idempotent: safe to run more than once. The dashboard falls back to the old
-- queries when this function is missing, so code can ship first.
--
-- get_dashboard_events(p_brand_id) replaces three sequential reads on
-- /dashboard: organizer_profiles.selected_org_id, then organizations, then
-- campaigns with every session, signup id, item and item signup id nested.
-- It returns:
--   org     { id, name, needs_naming, brand_id } picked exactly like
--           getCurrentOrganization (saved selection for this brand, else the
--           caller's own org, named first, oldest first), or null
--   events  the org's campaigns for this brand, newest first, each with
--           id, name, created_at, event_type, event_date, event_dates,
--           session_dates, total_capacity, total_signups, item_count,
--           item_signups, unclaimed_items
-- Counts only: no signup ids, names, emails or phones leave the database.
-- Returns NULL when there is no signed in user.
--
-- SECURITY INVOKER: every read runs under the caller's own RLS, the same
-- policies the dashboard's direct queries hit today, so a user sees counts
-- only for campaigns and signups they can already read.

CREATE OR REPLACE FUNCTION public.get_dashboard_events(p_brand_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_selected uuid;
  v_org_id uuid;
  v_org_name text;
  v_org_needs_naming boolean;
  v_org_brand text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT op.selected_org_id INTO v_selected
  FROM public.organizer_profiles op
  WHERE op.user_id = v_uid
    AND op.brand_id = p_brand_id
  LIMIT 1;

  IF v_selected IS NOT NULL THEN
    SELECT o.id, o.name, o.needs_naming, o.brand_id
      INTO v_org_id, v_org_name, v_org_needs_naming, v_org_brand
    FROM public.organizations o
    WHERE o.id = v_selected
      AND o.brand_id = p_brand_id;
  END IF;

  -- Stale or missing selection: prefer a named org the caller owns, oldest first.
  IF v_org_id IS NULL THEN
    SELECT o.id, o.name, o.needs_naming, o.brand_id
      INTO v_org_id, v_org_name, v_org_needs_naming, v_org_brand
    FROM public.organizations o
    WHERE o.brand_id = p_brand_id
      AND o.owner_id = v_uid
    ORDER BY o.needs_naming ASC, o.created_at ASC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'org', CASE WHEN v_org_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_org_id,
      'name', v_org_name,
      'needs_naming', v_org_needs_naming,
      'brand_id', v_org_brand
    ) END,
    'events', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', c.id,
               'name', c.name,
               'created_at', c.created_at,
               'event_type', c.event_type,
               'event_date', c.event_date,
               'event_dates', c.event_dates,
               'session_dates', COALESCE((
                 SELECT jsonb_agg(s.session_date ORDER BY s.session_date)
                 FROM public.sessions s
                 WHERE s.campaign_id = c.id AND s.session_date IS NOT NULL
               ), '[]'::jsonb),
               'total_capacity', COALESCE((
                 SELECT sum(s.capacity) FROM public.sessions s WHERE s.campaign_id = c.id
               ), 0),
               'total_signups', (
                 SELECT count(*)
                 FROM public.signups su
                 JOIN public.sessions s ON s.id = su.session_id
                 WHERE s.campaign_id = c.id
               ),
               'item_count', (
                 SELECT count(*) FROM public.campaign_items ci WHERE ci.campaign_id = c.id
               ),
               'item_signups', (
                 SELECT count(*)
                 FROM public.item_signups isg
                 JOIN public.campaign_items ci ON ci.id = isg.item_id
                 WHERE ci.campaign_id = c.id
               ),
               'unclaimed_items', (
                 SELECT count(*)
                 FROM public.campaign_items ci
                 WHERE ci.campaign_id = c.id
                   AND NOT EXISTS (SELECT 1 FROM public.item_signups isg WHERE isg.item_id = ci.id)
               )
             ) ORDER BY c.created_at DESC)
      FROM public.campaigns c
      WHERE c.brand_id = p_brand_id
        AND (v_org_id IS NULL OR c.organization_id = v_org_id)
    ), '[]'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public.get_dashboard_events(text) IS
  'Dashboard org + campaign list with counts in one call. SECURITY INVOKER; caller RLS applies to every read.';

-- Signed in organizers only. Supabase default privileges grant EXECUTE to
-- anon and authenticated explicitly, so revoke from every role first.
REVOKE ALL ON FUNCTION public.get_dashboard_events(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_events(text) TO authenticated, service_role;
