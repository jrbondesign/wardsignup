-- Explicit Data API grants for every public table and view.
--
-- From Oct 30, 2026 Supabase no longer grants anon/authenticated/service_role
-- access to new public tables automatically. Fresh projects, branches and
-- `supabase db reset` would then get "permission denied" from PostgREST.
-- This file restates the grants prod has today (snapshot read 2026-10-20).
-- On prod it changes nothing. RLS policies are untouched.
--
-- Rule going forward: any migration that creates a table must include its
-- GRANTs in the same file (see CONTRIBUTING.md).

-- ---------------------------------------------------------------------------
-- 1) service_role: full DML on every public table and view.
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.action_rate_limit,
  public.calendar_event_links,
  public.campaign_calendar_sync,
  public.campaign_items,
  public.campaigns,
  public.creator_signup_notification_log,
  public.cron_runs,
  public.email_queue,
  public.email_suppressions,
  public.event_invites,
  public.feedback_requests,
  public.geography_snapshot_cache,
  public.google_calendar_connections,
  public.item_signups,
  public.mcp_tokens,
  public.organization_members,
  public.organizations,
  public.organizer_profiles,
  public.sessions,
  public.signup_rate_limit,
  public.signups,
  public.welcome_email_sent,
  public.google_calendar_connections_safe,
  public.item_signups_public,
  public.signups_public
TO service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ---------------------------------------------------------------------------
-- 2) anon + authenticated: tables that still have the original broad grants.
-- RLS is what limits rows on these; the grants match prod exactly.
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.action_rate_limit,
  public.calendar_event_links,
  public.campaign_calendar_sync,
  public.campaign_items,
  public.campaigns,
  public.creator_signup_notification_log,
  public.cron_runs,
  public.email_queue,
  public.email_suppressions,
  public.event_invites,
  public.feedback_requests,
  public.geography_snapshot_cache,
  public.mcp_tokens,
  public.organization_members,
  public.organizations,
  public.organizer_profiles,
  public.sessions,
  public.signup_rate_limit,
  public.welcome_email_sent
TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Narrowed tables. Keep every earlier REVOKE in effect.
-- ---------------------------------------------------------------------------

-- signups: anon has nothing (20261019230000); authenticated keeps DML.
REVOKE ALL ON public.signups FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signups TO authenticated;

-- item_signups: inserts go through create_item_signup_if_capacity
-- (20260927220000). Prod also has no SELECT for anon; that revoke is not in
-- any earlier migration, so it is restated here.
REVOKE INSERT, SELECT ON public.item_signups FROM anon;
REVOKE INSERT ON public.item_signups FROM authenticated;
GRANT UPDATE, DELETE ON public.item_signups TO anon;
GRANT SELECT, UPDATE, DELETE ON public.item_signups TO authenticated;

-- google_calendar_connections: no anon access; authenticated reads only the
-- non-secret columns (20261019230000).
REVOKE ALL ON public.google_calendar_connections FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.google_calendar_connections FROM authenticated;
GRANT SELECT (
  id, user_id, organization_id, google_email, scopes, created_at, revoked_at,
  last_error, default_calendar_id, default_calendar_name, status, broken_at
) ON public.google_calendar_connections TO authenticated;

-- Views: read-only for the public (20261019230000, 20261019233000).
REVOKE ALL ON public.google_calendar_connections_safe FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.google_calendar_connections_safe FROM authenticated;
GRANT SELECT ON public.google_calendar_connections_safe TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.signups_public, public.item_signups_public FROM anon, authenticated;
GRANT SELECT ON public.signups_public, public.item_signups_public TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) service_role EXECUTE on every function the app calls through .rpc().
-- anon/authenticated function grants are left as earlier migrations set them.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_item_signup_if_capacity',
        'create_signup_if_capacity',
        'get_dashboard_events',
        'get_public_campaign',
        'get_public_directory_slug_for_campaign',
        'get_public_event_page',
        'get_public_org_campaigns',
        'metrics_creator_breakdown',
        'metrics_total_capacity',
        'transfer_organization_ownership',
        'try_claim_cron_run',
        'try_consume_action_rate',
        'try_consume_signup_rate',
        'try_insert_creator_signup_notification'
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5) Default privileges for tables created later by the migration role.
-- anon is deliberately left out: new tables start closed to it.
-- ---------------------------------------------------------------------------

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
