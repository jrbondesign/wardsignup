-- Security HIGH x2 (Oct 19 2026 audit). Idempotent: safe to run more than once.
-- NOTE: DO NOT APPLY TO PRODUCTION until Jonathan gives GO.
--
-- 1) public.signups had a hand-added policy "Enable all for signups"
--    (FOR ALL TO public USING true WITH CHECK true). Policies OR together, so it
--    overrode the org-member rules: any signed-in user could read, edit or
--    delete every signup (emails, phones, notes, cancel tokens), and anon could
--    insert directly, skipping the capacity check.
--    After this:
--      * public signups go through create_signup_if_capacity (SECURITY DEFINER,
--        owned by postgres), so they keep working without anon table grants
--      * cancel, lookup, calendar token, bulk, cron and metrics use service role
--      * creators read / update / delete through the existing
--        "Org members ... signups" policies
--      * the public event page reads signups_public (unchanged)
--
-- 2) public.google_calendar_connections_safe was a SECURITY DEFINER view (the
--    default) owned by postgres, and anon/authenticated held every privilege
--    on it. It bypassed RLS, so anyone with the anon key could list every
--    connection (google_email, org ids) and update or delete rows through the
--    auto-updatable view.
--    After this the view runs as the caller (security_invoker), anon has no
--    access, authenticated can only SELECT it, and the base table gets an
--    org-member SELECT policy so co-admins still see the org's connection
--    (settings page, event calendar controls, reconnect banner).
--    Column-level SELECT keeps refresh_token_enc, broken_reason and
--    broken_notified_at server-only. Every write to the base table already uses
--    the service role (OAuth callback, disconnect, default-calendar picker,
--    health/broken marking, sync), so authenticated needs no write grant.
--    The only user-session base-table read is the calendar-sync PATCH route
--    (id, default_calendar_id, default_calendar_name for its own user_id).
--
--    If a later migration drops and recreates google_calendar_connections_safe,
--    it must set (security_invoker = true) again and must not re-grant anon.

-- ---------------------------------------------------------------------------
-- 1) signups
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Enable all for signups" ON public.signups;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.signups FROM anon;
-- TRUNCATE ignores RLS; nothing in the app truncates with a user session.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.signups FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2) google_calendar_connections_safe + base table
-- ---------------------------------------------------------------------------

ALTER VIEW public.google_calendar_connections_safe SET (security_invoker = true);

REVOKE ALL ON public.google_calendar_connections_safe FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.google_calendar_connections_safe FROM authenticated;
GRANT SELECT ON public.google_calendar_connections_safe TO authenticated;

DROP POLICY IF EXISTS "Org members view org connections metadata" ON public.google_calendar_connections;
CREATE POLICY "Org members view org connections metadata"
  ON public.google_calendar_connections
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

REVOKE ALL ON public.google_calendar_connections FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.google_calendar_connections FROM authenticated;
GRANT SELECT (
  id,
  user_id,
  organization_id,
  google_email,
  scopes,
  created_at,
  revoked_at,
  last_error,
  default_calendar_id,
  default_calendar_name,
  status,
  broken_at
) ON public.google_calendar_connections TO authenticated;

GRANT ALL ON public.google_calendar_connections TO service_role;
GRANT ALL ON public.google_calendar_connections_safe TO service_role;
