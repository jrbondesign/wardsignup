-- Fix 5: wrap bare auth.uid() / auth.role() in RLS policies as
-- (select auth.uid()) / (select auth.role()).
--
-- Why: a bare auth.uid() in a policy is evaluated once per row. Wrapped in a
-- scalar subquery, Postgres plans it as an InitPlan and evaluates it once per
-- statement, then compares every row against the cached value. Same result,
-- far less work on large scans. This is Supabase's documented RLS performance
-- advice and what the Performance Advisor lint "auth_rls_initplan" flags.
--
-- Semantics: unchanged. auth.uid() and auth.role() are STABLE (they read the
-- request JWT, which is fixed for the statement), so evaluating them once per
-- statement returns the same value as evaluating them per row. Every policy
-- below keeps its exact name, table, command, roles (all TO public, as today)
-- and PERMISSIVE mode; the only change in each expression is the wrap.
-- scripts/rls-tests/run_initplan.sh proves this on a local database by
-- comparing pg_policies before and after (identical once the wrap is
-- normalized away) and running the same access matrix on both.
--
-- Not touched: policies that only call public.is_org_member(...) or
-- calendar_connection_matches_campaign_org(...). Those helpers read
-- auth.uid() inside their own bodies and take a row column, so there is no
-- bare call in the policy to wrap. No auth.jwt() or auth.email() appears in
-- any policy.
--
-- Covered here (12 policies; with the 3 storage.objects policies in
-- 20261103090100_rls_initplan_wrap_storage.sql that is all 15 policies that
-- call auth.* in prod pg_policies on 2026-11-02):
--   public.campaigns                    Org members insert campaigns
--   public.google_calendar_connections  Users can view own connections metadata
--   public.mcp_tokens                   Users can view their own MCP tokens
--   public.mcp_tokens                   Users can delete their own MCP tokens
--   public.organization_members         Members and owner read members
--   public.organization_members         Owner manages members
--   public.organizations                Members and owner read organizations
--   public.organizations                Owner updates organization
--   public.organizations                Users insert own organization
--   public.organizer_profiles           Users read own organizer profile
--   public.organizer_profiles           Users insert own organizer profile
--   public.organizer_profiles           Users update own organizer profile
--
-- Runs in one transaction, so no request ever sees a table without its
-- policy. Idempotent (DROP POLICY IF EXISTS + CREATE).
-- Applying this to prod needs Jonathan's own GO.

BEGIN;

-- public.campaigns ----------------------------------------------------------
DROP POLICY IF EXISTS "Org members insert campaigns" ON public.campaigns;
CREATE POLICY "Org members insert campaigns" ON public.campaigns
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (public.is_org_member(organization_id) AND created_by = (select auth.uid()));

-- public.google_calendar_connections ---------------------------------------
DROP POLICY IF EXISTS "Users can view own connections metadata" ON public.google_calendar_connections;
CREATE POLICY "Users can view own connections metadata" ON public.google_calendar_connections
  AS PERMISSIVE FOR SELECT TO public
  USING ((select auth.uid()) = user_id);

-- public.mcp_tokens ---------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own MCP tokens" ON public.mcp_tokens;
CREATE POLICY "Users can view their own MCP tokens" ON public.mcp_tokens
  AS PERMISSIVE FOR SELECT TO public
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own MCP tokens" ON public.mcp_tokens;
CREATE POLICY "Users can delete their own MCP tokens" ON public.mcp_tokens
  AS PERMISSIVE FOR DELETE TO public
  USING ((select auth.uid()) = user_id);

-- public.organization_members ----------------------------------------------
DROP POLICY IF EXISTS "Members and owner read members" ON public.organization_members;
CREATE POLICY "Members and owner read members" ON public.organization_members
  AS PERMISSIVE FOR SELECT TO public
  USING (
    public.is_org_member(organization_id)
    OR organization_id IN (
      SELECT organizations.id FROM public.organizations
      WHERE organizations.owner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owner manages members" ON public.organization_members;
CREATE POLICY "Owner manages members" ON public.organization_members
  AS PERMISSIVE FOR ALL TO public
  USING (
    organization_id IN (
      SELECT organizations.id FROM public.organizations
      WHERE organizations.owner_id = (select auth.uid())
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organizations.id FROM public.organizations
      WHERE organizations.owner_id = (select auth.uid())
    )
  );

-- public.organizations ------------------------------------------------------
DROP POLICY IF EXISTS "Members and owner read organizations" ON public.organizations;
CREATE POLICY "Members and owner read organizations" ON public.organizations
  AS PERMISSIVE FOR SELECT TO public
  USING (public.is_org_member(id) OR owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Owner updates organization" ON public.organizations;
CREATE POLICY "Owner updates organization" ON public.organizations
  AS PERMISSIVE FOR UPDATE TO public
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users insert own organization" ON public.organizations;
CREATE POLICY "Users insert own organization" ON public.organizations
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (created_by = (select auth.uid()));

-- public.organizer_profiles -------------------------------------------------
DROP POLICY IF EXISTS "Users read own organizer profile" ON public.organizer_profiles;
CREATE POLICY "Users read own organizer profile" ON public.organizer_profiles
  AS PERMISSIVE FOR SELECT TO public
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users insert own organizer profile" ON public.organizer_profiles;
CREATE POLICY "Users insert own organizer profile" ON public.organizer_profiles
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = user_id);

-- UPDATE has USING only today (no WITH CHECK); kept that way on purpose so
-- this migration changes nothing but the wrap.
DROP POLICY IF EXISTS "Users update own organizer profile" ON public.organizer_profiles;
CREATE POLICY "Users update own organizer profile" ON public.organizer_profiles
  AS PERMISSIVE FOR UPDATE TO public
  USING ((select auth.uid()) = user_id);

COMMIT;
