-- Local RLS behavior check for 20261103090000_rls_initplan_wrap_auth_calls.sql.
-- Runs against a LOCAL database only (scripts/rls-tests/run_initplan.sh).
-- Never run against prod: it writes fixtures (rolled back at the end).
--
-- Exercises every policy the migration rewrites, as anon, as an org owner, as
-- an owner who is not in organization_members (so the owner_id = auth.uid()
-- branch is what grants access, not is_org_member), and as an outsider.
-- run_initplan.sh runs it on the database BEFORE and AFTER the migration; both
-- must pass with the same expectations, which is the "semantics unchanged" proof.
\set ON_ERROR_STOP on
SET client_min_messages = warning;

BEGIN;

-- Fixtures (as the migration owner). Fake ids and addresses only.
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'owner@example.test'),
  ('b0000000-0000-0000-0000-00000000000b', 'outsider@example.test'),
  ('c0000000-0000-0000-0000-00000000000c', 'other-org@example.test');
INSERT INTO public.organizations (id, brand_id, name, created_by, owner_id) VALUES
  ('0a000000-0000-0000-0000-0000000000a1', 'wardsignup', 'Org A', 'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a'),
  ('0d000000-0000-0000-0000-0000000000d1', 'wardsignup', 'Org D', 'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a'),
  ('0c000000-0000-0000-0000-0000000000c1', 'wardsignup', 'Org C', 'c0000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-00000000000c');
-- Org D: A owns it but has no membership row, so only owner_id = auth.uid() grants access.
DELETE FROM public.organization_members WHERE organization_id = '0d000000-0000-0000-0000-0000000000d1';
INSERT INTO public.organization_members (organization_id, user_id, invited_email, invited_by, role, status) VALUES
  ('0d000000-0000-0000-0000-0000000000d1', NULL, 'pending@example.test', 'a0000000-0000-0000-0000-00000000000a', 'admin', 'pending');
INSERT INTO public.organizer_profiles (user_id, brand_id) VALUES
  ('b0000000-0000-0000-0000-00000000000b', 'wardsignup'),
  ('c0000000-0000-0000-0000-00000000000c', 'wardsignup');
INSERT INTO public.mcp_tokens (user_id, brand_id, token_hash) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'wardsignup', 'hash-a'),
  ('b0000000-0000-0000-0000-00000000000b', 'wardsignup', 'hash-b');
INSERT INTO public.google_calendar_connections (user_id, organization_id, google_email, refresh_token_enc, scopes) VALUES
  ('a0000000-0000-0000-0000-00000000000a', '0d000000-0000-0000-0000-0000000000d1', 'a@example.test', 'x', 's'),
  ('c0000000-0000-0000-0000-00000000000c', '0c000000-0000-0000-0000-0000000000c1', 'c@example.test', 'x', 's');
INSERT INTO storage.buckets (id, name, public) VALUES ('event-media', 'event-media', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('other', 'other', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('event-media', 'a0000000-0000-0000-0000-00000000000a/own.png'),
  ('event-media', 'b0000000-0000-0000-0000-00000000000b/theirs.png');
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;
GRANT SELECT ON storage.buckets TO anon, authenticated;

CREATE TEMP TABLE rls_results (n serial, actor text, action text, expected text, got text);
GRANT ALL ON rls_results TO anon, authenticated, service_role;
GRANT USAGE ON SEQUENCE rls_results_n_seq TO anon, authenticated, service_role;

-- Runs one statement as the current role; records ok:<rows> or denied:<sqlstate>.
-- Each case runs in its own subtransaction and is rolled back, so cases do not
-- depend on each other.
CREATE FUNCTION pg_temp.try_as(p_actor text, p_action text, p_expected text, p_sql text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_rows bigint; v_got text;
BEGIN
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_got := 'ok:' || v_rows;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rollback-case';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rollback-case' THEN v_got := 'denied:' || SQLSTATE; END IF;
  END;
  INSERT INTO rls_results (actor, action, expected, got) VALUES (p_actor, p_action, p_expected, v_got);
END $$;

-- anon ---------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT pg_temp.try_as('anon', 'read organizer_profiles', 'ok:0', $q$SELECT * FROM public.organizer_profiles$q$);
SELECT pg_temp.try_as('anon', 'insert organizer_profile', 'denied',
  $q$INSERT INTO public.organizer_profiles (user_id, brand_id) VALUES ('a0000000-0000-0000-0000-00000000000a', 'wardsignup')$q$);
SELECT pg_temp.try_as('anon', 'read mcp_tokens', 'ok:0', $q$SELECT * FROM public.mcp_tokens$q$);
SELECT pg_temp.try_as('anon', 'delete mcp_tokens', 'ok:0', $q$DELETE FROM public.mcp_tokens$q$);
SELECT pg_temp.try_as('anon', 'read google_calendar_connections (no grant)', 'denied', $q$SELECT id FROM public.google_calendar_connections$q$);
SELECT pg_temp.try_as('anon', 'read organizations', 'ok:0', $q$SELECT * FROM public.organizations$q$);
SELECT pg_temp.try_as('anon', 'update organizations', 'ok:0', $q$UPDATE public.organizations SET name = 'x'$q$);
SELECT pg_temp.try_as('anon', 'insert organization', 'denied',
  $q$INSERT INTO public.organizations (brand_id, name, created_by, owner_id) VALUES ('wardsignup', 'x', 'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a')$q$);
SELECT pg_temp.try_as('anon', 'read organization_members', 'ok:0', $q$SELECT * FROM public.organization_members$q$);
SELECT pg_temp.try_as('anon', 'insert campaign', 'denied',
  $q$INSERT INTO public.campaigns (name, organization_id, created_by) VALUES ('x', '0a000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a')$q$);
SELECT pg_temp.try_as('anon', 'upload event-media object', 'denied',
  $q$INSERT INTO storage.objects (bucket_id, name) VALUES ('event-media', 'a0000000-0000-0000-0000-00000000000a/anon.png')$q$);
SELECT pg_temp.try_as('anon', 'update event-media objects', 'ok:0', $q$UPDATE storage.objects SET metadata = '{}'$q$);
SELECT pg_temp.try_as('anon', 'delete event-media objects', 'ok:0', $q$DELETE FROM storage.objects$q$);
SELECT pg_temp.try_as('anon', 'read event-media (public)', 'ok:2', $q$SELECT * FROM storage.objects WHERE bucket_id = 'event-media'$q$);
RESET ROLE;

-- A: owner of Org A (member) and Org D (owner only) -------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"a0000000-0000-0000-0000-00000000000a"}', true);
SELECT pg_temp.try_as('owner A', 'insert own organizer_profile', 'ok:1',
  $q$INSERT INTO public.organizer_profiles (user_id, brand_id) VALUES ('a0000000-0000-0000-0000-00000000000a', 'wardsignup')$q$);
SELECT pg_temp.try_as('owner A', 'insert organizer_profile for B', 'denied',
  $q$INSERT INTO public.organizer_profiles (user_id, brand_id) VALUES ('b0000000-0000-0000-0000-00000000000b', 'wardsignup')$q$);
SELECT pg_temp.try_as('owner A', 'read others'' organizer_profiles', 'ok:0', $q$SELECT * FROM public.organizer_profiles$q$);
SELECT pg_temp.try_as('owner A', 'update B''s organizer_profile', 'ok:0',
  $q$UPDATE public.organizer_profiles SET logo_url = 'x' WHERE user_id = 'b0000000-0000-0000-0000-00000000000b'$q$);
SELECT pg_temp.try_as('owner A', 'read mcp_tokens (own only)', 'ok:1', $q$SELECT * FROM public.mcp_tokens$q$);
SELECT pg_temp.try_as('owner A', 'delete B''s mcp_token', 'ok:0',
  $q$DELETE FROM public.mcp_tokens WHERE user_id = 'b0000000-0000-0000-0000-00000000000b'$q$);
SELECT pg_temp.try_as('owner A', 'delete own mcp_token', 'ok:1',
  $q$DELETE FROM public.mcp_tokens WHERE user_id = 'a0000000-0000-0000-0000-00000000000a'$q$);
SELECT pg_temp.try_as('owner A', 'read own calendar connection (Org D, not a member)', 'ok:1',
  $q$SELECT id, user_id FROM public.google_calendar_connections WHERE user_id = 'a0000000-0000-0000-0000-00000000000a'$q$);
SELECT pg_temp.try_as('owner A', 'read C''s calendar connection', 'ok:0',
  $q$SELECT id, user_id FROM public.google_calendar_connections WHERE user_id = 'c0000000-0000-0000-0000-00000000000c'$q$);
SELECT pg_temp.try_as('owner A', 'read organizations (A and D)', 'ok:2', $q$SELECT * FROM public.organizations$q$);
SELECT pg_temp.try_as('owner A', 'update Org D name (owner only)', 'ok:1',
  $q$UPDATE public.organizations SET name = 'D2' WHERE id = '0d000000-0000-0000-0000-0000000000d1'$q$);
SELECT pg_temp.try_as('owner A', 'update Org C', 'ok:0',
  $q$UPDATE public.organizations SET name = 'C2' WHERE id = '0c000000-0000-0000-0000-0000000000c1'$q$);
SELECT pg_temp.try_as('owner A', 'hand Org D to B (WITH CHECK)', 'denied',
  $q$UPDATE public.organizations SET owner_id = 'b0000000-0000-0000-0000-00000000000b' WHERE id = '0d000000-0000-0000-0000-0000000000d1'$q$);
SELECT pg_temp.try_as('owner A', 'insert own organization', 'ok:1',
  $q$INSERT INTO public.organizations (brand_id, name, created_by, owner_id) VALUES ('wardsignup', 'New', 'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a')$q$);
SELECT pg_temp.try_as('owner A', 'insert organization as B', 'denied',
  $q$INSERT INTO public.organizations (brand_id, name, created_by, owner_id) VALUES ('wardsignup', 'New', 'b0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b')$q$);
SELECT pg_temp.try_as('owner A', 'read Org D members (owner only)', 'ok:1',
  $q$SELECT * FROM public.organization_members WHERE organization_id = '0d000000-0000-0000-0000-0000000000d1'$q$);
SELECT pg_temp.try_as('owner A', 'read Org C members', 'ok:0',
  $q$SELECT * FROM public.organization_members WHERE organization_id = '0c000000-0000-0000-0000-0000000000c1'$q$);
SELECT pg_temp.try_as('owner A', 'add member to Org D (owner only)', 'ok:1',
  $q$INSERT INTO public.organization_members (organization_id, invited_email, invited_by, role) VALUES ('0d000000-0000-0000-0000-0000000000d1', 'new@example.test', 'a0000000-0000-0000-0000-00000000000a', 'admin')$q$);
SELECT pg_temp.try_as('owner A', 'add member to Org C', 'denied',
  $q$INSERT INTO public.organization_members (organization_id, invited_email, invited_by, role) VALUES ('0c000000-0000-0000-0000-0000000000c1', 'new@example.test', 'a0000000-0000-0000-0000-00000000000a', 'admin')$q$);
SELECT pg_temp.try_as('owner A', 'move Org D member to Org C (WITH CHECK)', 'denied',
  $q$UPDATE public.organization_members SET organization_id = '0c000000-0000-0000-0000-0000000000c1' WHERE organization_id = '0d000000-0000-0000-0000-0000000000d1'$q$);
SELECT pg_temp.try_as('owner A', 'delete Org D member', 'ok:1',
  $q$DELETE FROM public.organization_members WHERE organization_id = '0d000000-0000-0000-0000-0000000000d1'$q$);
SELECT pg_temp.try_as('owner A', 'insert campaign in Org A as self', 'ok:1',
  $q$INSERT INTO public.campaigns (name, organization_id, created_by) VALUES ('x', '0a000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a')$q$);
SELECT pg_temp.try_as('owner A', 'insert campaign in Org A as B', 'denied',
  $q$INSERT INTO public.campaigns (name, organization_id, created_by) VALUES ('x', '0a000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-00000000000b')$q$);
SELECT pg_temp.try_as('owner A', 'insert campaign in Org C', 'denied',
  $q$INSERT INTO public.campaigns (name, organization_id, created_by) VALUES ('x', '0c000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-00000000000a')$q$);
SELECT pg_temp.try_as('owner A', 'upload to own folder', 'ok:1',
  $q$INSERT INTO storage.objects (bucket_id, name) VALUES ('event-media', 'a0000000-0000-0000-0000-00000000000a/new.png')$q$);
SELECT pg_temp.try_as('owner A', 'upload to B''s folder', 'denied',
  $q$INSERT INTO storage.objects (bucket_id, name) VALUES ('event-media', 'b0000000-0000-0000-0000-00000000000b/new.png')$q$);
SELECT pg_temp.try_as('owner A', 'upload own folder, other bucket', 'denied',
  $q$INSERT INTO storage.objects (bucket_id, name) VALUES ('other', 'a0000000-0000-0000-0000-00000000000a/new.png')$q$);
SELECT pg_temp.try_as('owner A', 'update objects (own only)', 'ok:1', $q$UPDATE storage.objects SET metadata = '{}'$q$);
SELECT pg_temp.try_as('owner A', 'delete objects (own only)', 'ok:1', $q$DELETE FROM storage.objects$q$);
RESET ROLE;

-- signed in, but the JWT role claim is not 'authenticated' (auth.role() check)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"anon","sub":"a0000000-0000-0000-0000-00000000000a"}', true);
SELECT pg_temp.try_as('A with role claim anon', 'upload to own folder', 'denied',
  $q$INSERT INTO storage.objects (bucket_id, name) VALUES ('event-media', 'a0000000-0000-0000-0000-00000000000a/x.png')$q$);
SELECT pg_temp.try_as('A with role claim anon', 'delete own objects', 'ok:0', $q$DELETE FROM storage.objects$q$);
RESET ROLE;

-- B: signed in outsider (no org) --------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"b0000000-0000-0000-0000-00000000000b"}', true);
SELECT pg_temp.try_as('outsider B', 'read own organizer_profile', 'ok:1', $q$SELECT * FROM public.organizer_profiles$q$);
SELECT pg_temp.try_as('outsider B', 'update own organizer_profile', 'ok:1',
  $q$UPDATE public.organizer_profiles SET logo_url = 'x' WHERE user_id = 'b0000000-0000-0000-0000-00000000000b'$q$);
SELECT pg_temp.try_as('outsider B', 'read organizations', 'ok:0', $q$SELECT * FROM public.organizations$q$);
SELECT pg_temp.try_as('outsider B', 'update Org D', 'ok:0', $q$UPDATE public.organizations SET name = 'x'$q$);
SELECT pg_temp.try_as('outsider B', 'read organization_members', 'ok:0', $q$SELECT * FROM public.organization_members$q$);
SELECT pg_temp.try_as('outsider B', 'add self to Org D', 'denied',
  $q$INSERT INTO public.organization_members (organization_id, user_id, invited_email, invited_by, role, status) VALUES ('0d000000-0000-0000-0000-0000000000d1', 'b0000000-0000-0000-0000-00000000000b', 'b@example.test', 'b0000000-0000-0000-0000-00000000000b', 'admin', 'accepted')$q$);
SELECT pg_temp.try_as('outsider B', 'read mcp_tokens (own only)', 'ok:1', $q$SELECT * FROM public.mcp_tokens$q$);
SELECT pg_temp.try_as('outsider B', 'read calendar connections', 'ok:0', $q$SELECT id, user_id FROM public.google_calendar_connections$q$);
SELECT pg_temp.try_as('outsider B', 'delete objects (own only)', 'ok:1', $q$DELETE FROM storage.objects$q$);
RESET ROLE;

SET client_min_messages = notice;
\pset footer off
SELECT n, actor, action, expected, got,
       CASE WHEN got = expected OR (expected = 'denied' AND got LIKE 'denied:%') THEN 'PASS' ELSE 'FAIL' END AS result
FROM rls_results ORDER BY n;

DO $$
DECLARE v_fail int; v_total int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE NOT (got = expected OR (expected = 'denied' AND got LIKE 'denied:%')))
    INTO v_total, v_fail FROM rls_results;
  IF v_fail > 0 THEN RAISE EXCEPTION '% of % RLS case(s) failed', v_fail, v_total; END IF;
  RAISE NOTICE 'all % RLS cases passed', v_total;
END $$;

ROLLBACK;
