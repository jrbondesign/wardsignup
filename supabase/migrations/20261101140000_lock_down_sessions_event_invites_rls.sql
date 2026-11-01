-- Lock down RLS on public.sessions and public.event_invites.
--
-- Prod has two policies that are not in any repo migration (added outside
-- migrations): "Enable all for sessions" and "Enable all for event_invites",
-- both FOR ALL TO public USING (true) WITH CHECK (true). Policies are OR'd,
-- so they override the org member policies and let anyone holding the public
-- anon key insert, update or delete any session, and read or write any invite
-- (invitee email and name).
--
-- After this migration:
--   sessions       SELECT: everyone (public event pages, signup flow,
--                  get_public_event_page, flyer). INSERT/UPDATE/DELETE: signed
--                  in members of the event's organization only.
--   event_invites  all access: signed in members of the event's organization
--                  only. No anon access at all.
--
-- Unaffected: create_signup_if_capacity, create_item_signup_if_capacity,
-- is_org_member and the cancel route (service role) are SECURITY DEFINER or
-- bypass RLS. Server routes that act for a user use the user's JWT and already
-- check org membership. Cron, calendar sync and metrics use the service role.
--
-- Membership uses the existing helper public.is_org_member(org_id), the same
-- check the campaigns, campaign_items and calendar policies use. It is
-- SECURITY DEFINER and reads auth.uid() itself, so there is no bare auth.uid()
-- in these policies to wrap in (select ...).
--
-- Grants: anon keeps only SELECT on sessions and loses everything on
-- event_invites. TRUNCATE, TRIGGER and REFERENCES are revoked from anon and
-- authenticated on both tables (TRUNCATE is not subject to RLS).
-- service_role is unchanged. Idempotent: safe to run more than once.

BEGIN;

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for sessions" ON public.sessions;

DROP POLICY IF EXISTS "Anyone can read sessions" ON public.sessions;
CREATE POLICY "Anyone can read sessions" ON public.sessions
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Org members insert sessions" ON public.sessions;
CREATE POLICY "Org members insert sessions" ON public.sessions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = sessions.campaign_id AND public.is_org_member(c.organization_id)
  ));

DROP POLICY IF EXISTS "Org members update sessions" ON public.sessions;
CREATE POLICY "Org members update sessions" ON public.sessions
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = sessions.campaign_id AND public.is_org_member(c.organization_id)
  ))
  -- New: the updated row must also belong to one of the member's events, so a
  -- session can't be moved onto someone else's event.
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = sessions.campaign_id AND public.is_org_member(c.organization_id)
  ));

DROP POLICY IF EXISTS "Org members delete sessions" ON public.sessions;
CREATE POLICY "Org members delete sessions" ON public.sessions
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = sessions.campaign_id AND public.is_org_member(c.organization_id)
  ));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.sessions FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.sessions FROM authenticated;
GRANT SELECT ON public.sessions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO authenticated;

-- ---------------------------------------------------------------------------
-- event_invites
-- ---------------------------------------------------------------------------
ALTER TABLE public.event_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for event_invites" ON public.event_invites;

DROP POLICY IF EXISTS "Org members read event invites" ON public.event_invites;
CREATE POLICY "Org members read event invites" ON public.event_invites
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = event_invites.campaign_id AND public.is_org_member(c.organization_id)
  ));

DROP POLICY IF EXISTS "Org members insert event invites" ON public.event_invites;
CREATE POLICY "Org members insert event invites" ON public.event_invites
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = event_invites.campaign_id AND public.is_org_member(c.organization_id)
  ));

DROP POLICY IF EXISTS "Org members update event invites" ON public.event_invites;
CREATE POLICY "Org members update event invites" ON public.event_invites
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = event_invites.campaign_id AND public.is_org_member(c.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = event_invites.campaign_id AND public.is_org_member(c.organization_id)
  ));

DROP POLICY IF EXISTS "Org members delete event invites" ON public.event_invites;
CREATE POLICY "Org members delete event invites" ON public.event_invites
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = event_invites.campaign_id AND public.is_org_member(c.organization_id)
  ));

REVOKE ALL ON public.event_invites FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.event_invites FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_invites TO authenticated;

COMMIT;
