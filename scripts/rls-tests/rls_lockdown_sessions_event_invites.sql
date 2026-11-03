-- Local RLS check for 20261101140000_lock_down_sessions_event_invites_rls.sql.
-- Runs against a LOCAL database only (supabase start, or the plain Postgres
-- harness described in the PR). Never run against prod: it writes fixtures.
--
-- Simulates PostgREST: SET ROLE anon/authenticated plus request.jwt.claims.
-- Ends with RAISE EXCEPTION if any case does not match the locked down
-- expectation, so a database without the migration fails loudly.
\set ON_ERROR_STOP on
SET client_min_messages = warning;

BEGIN;

-- Fixtures (as the migration owner). Fake ids and addresses only.
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'organizer@example.test'),
  ('b0000000-0000-0000-0000-00000000000b', 'outsider@example.test'),
  ('c0000000-0000-0000-0000-00000000000c', 'other-org@example.test');
INSERT INTO public.organizations (id, brand_id, name, created_by, owner_id) VALUES
  ('0a000000-0000-0000-0000-0000000000a1', 'wardsignup', 'Org A', 'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a'),
  ('0c000000-0000-0000-0000-0000000000c1', 'wardsignup', 'Org C', 'c0000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-00000000000c');
INSERT INTO public.campaigns (id, name, organization_id, created_by, show_signups_publicly) VALUES
  ('ca000000-0000-0000-0000-0000000000a1', 'Event A', '0a000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', true),
  ('cc000000-0000-0000-0000-0000000000c1', 'Event C', '0c000000-0000-0000-0000-0000000000c1', 'c0000000-0000-0000-0000-00000000000c', true);
INSERT INTO public.sessions (id, campaign_id, day_of_week, time, capacity) VALUES
  ('5a000000-0000-0000-0000-0000000000a1', 'ca000000-0000-0000-0000-0000000000a1', 1, '09:00', 5),
  ('5a000000-0000-0000-0000-0000000000a2', 'ca000000-0000-0000-0000-0000000000a1', 2, '10:00', 5);
INSERT INTO public.event_invites (id, campaign_id, inviter_id, invitee_email) VALUES
  ('1a000000-0000-0000-0000-0000000000a1', 'ca000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'invitee@example.test');

CREATE TEMP TABLE rls_results (n serial, actor text, action text, expected text, got text);
GRANT ALL ON rls_results TO anon, authenticated, service_role;
GRANT USAGE ON SEQUENCE rls_results_n_seq TO anon, authenticated, service_role;

-- Runs one statement as the current role; records ok:<rows> or denied:<sqlstate>.
CREATE FUNCTION pg_temp.try_as(p_actor text, p_action text, p_expected text, p_sql text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_rows bigint; v_got text;
BEGIN
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_got := 'ok:' || v_rows;
  EXCEPTION WHEN OTHERS THEN
    v_got := 'denied:' || SQLSTATE;
  END;
  INSERT INTO rls_results (actor, action, expected, got) VALUES (p_actor, p_action, p_expected, v_got);
END $$;

-- anon (public key) --------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT pg_temp.try_as('anon', 'read sessions of a public event', 'ok:2',
  $q$SELECT * FROM public.sessions WHERE campaign_id = 'ca000000-0000-0000-0000-0000000000a1'$q$);
SELECT pg_temp.try_as('anon', 'insert session', 'denied',
  $q$INSERT INTO public.sessions (campaign_id, day_of_week, time, capacity) VALUES ('ca000000-0000-0000-0000-0000000000a1', 3, '11:00', 1)$q$);
SELECT pg_temp.try_as('anon', 'update session', 'denied',
  $q$UPDATE public.sessions SET capacity = 1 WHERE id = '5a000000-0000-0000-0000-0000000000a1'$q$);
SELECT pg_temp.try_as('anon', 'delete session', 'denied',
  $q$DELETE FROM public.sessions WHERE id = '5a000000-0000-0000-0000-0000000000a1'$q$);
SELECT pg_temp.try_as('anon', 'truncate sessions', 'denied', $q$TRUNCATE public.sessions CASCADE$q$);
SELECT pg_temp.try_as('anon', 'read event_invites', 'denied', $q$SELECT * FROM public.event_invites$q$);
SELECT pg_temp.try_as('anon', 'insert event_invite', 'denied',
  $q$INSERT INTO public.event_invites (campaign_id, inviter_id, invitee_email) VALUES ('ca000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'x@example.test')$q$);
SELECT pg_temp.try_as('anon', 'update event_invite', 'denied',
  $q$UPDATE public.event_invites SET message = 'x'$q$);
SELECT pg_temp.try_as('anon', 'delete event_invite', 'denied', $q$DELETE FROM public.event_invites$q$);
SELECT pg_temp.try_as('anon', 'get_public_event_page returns sessions', 'ok:1',
  $q$SELECT 1 WHERE jsonb_array_length(public.get_public_event_page('ca000000-0000-0000-0000-0000000000a1') -> 'sessions') = 2$q$);
SELECT pg_temp.try_as('anon', 'get_public_campaign', 'ok:1',
  $q$SELECT * FROM public.get_public_campaign('ca000000-0000-0000-0000-0000000000a1')$q$);
SELECT pg_temp.try_as('anon', 'sign up via create_signup_if_capacity', 'ok:1',
  $q$SELECT * FROM public.create_signup_if_capacity('5a000000-0000-0000-0000-0000000000a1', 'ca000000-0000-0000-0000-0000000000a1', 'Test Signer', 'signer@example.test', NULL, '[]'::jsonb)$q$);
SELECT pg_temp.try_as('anon', 'signup visible in signups_public', 'ok:1',
  $q$SELECT * FROM public.signups_public WHERE session_id = '5a000000-0000-0000-0000-0000000000a1'$q$);
RESET ROLE;

-- cancel: /api/signups/cancel looks up and deletes by cancel_token with the service role.
SET LOCAL ROLE service_role;
SELECT pg_temp.try_as('service_role', 'cancel signup by cancel_token', 'ok:1',
  $q$DELETE FROM public.signups WHERE cancel_token = (SELECT cancel_token FROM public.signups WHERE member_email = 'signer@example.test' LIMIT 1)$q$);
RESET ROLE;

-- organizer (signed in, accepted member of the event's org) ------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"a0000000-0000-0000-0000-00000000000a"}', true);
SELECT pg_temp.try_as('organizer', 'insert session', 'ok:1',
  $q$INSERT INTO public.sessions (campaign_id, day_of_week, time, capacity) VALUES ('ca000000-0000-0000-0000-0000000000a1', 3, '11:00', 1)$q$);
SELECT pg_temp.try_as('organizer', 'update session', 'ok:1',
  $q$UPDATE public.sessions SET capacity = 9 WHERE id = '5a000000-0000-0000-0000-0000000000a1'$q$);
SELECT pg_temp.try_as('organizer', 'delete session', 'ok:1',
  $q$DELETE FROM public.sessions WHERE id = '5a000000-0000-0000-0000-0000000000a2'$q$);
SELECT pg_temp.try_as('organizer', 'move session onto another org''s event', 'denied',
  $q$UPDATE public.sessions SET campaign_id = 'cc000000-0000-0000-0000-0000000000c1' WHERE id = '5a000000-0000-0000-0000-0000000000a1'$q$);
SELECT pg_temp.try_as('organizer', 'truncate sessions', 'denied', $q$TRUNCATE public.sessions CASCADE$q$);
SELECT pg_temp.try_as('organizer', 'read event_invites', 'ok:1', $q$SELECT * FROM public.event_invites$q$);
SELECT pg_temp.try_as('organizer', 'insert event_invite', 'ok:1',
  $q$INSERT INTO public.event_invites (campaign_id, inviter_id, invitee_email) VALUES ('ca000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'second@example.test')$q$);
SELECT pg_temp.try_as('organizer', 'update event_invite', 'ok:2', $q$UPDATE public.event_invites SET message = 'hi'$q$);
SELECT pg_temp.try_as('organizer', 'delete event_invite', 'ok:1',
  $q$DELETE FROM public.event_invites WHERE invitee_email = 'second@example.test'$q$);
SELECT pg_temp.try_as('organizer', 'insert invite on another org''s event', 'denied',
  $q$INSERT INTO public.event_invites (campaign_id, inviter_id, invitee_email) VALUES ('cc000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-00000000000a', 'y@example.test')$q$);
RESET ROLE;

-- signed in, not a member of the event's org --------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"b0000000-0000-0000-0000-00000000000b"}', true);
SELECT pg_temp.try_as('non-member', 'read sessions (public)', 'ok:2',
  $q$SELECT * FROM public.sessions WHERE campaign_id = 'ca000000-0000-0000-0000-0000000000a1'$q$);
SELECT pg_temp.try_as('non-member', 'insert session', 'denied',
  $q$INSERT INTO public.sessions (campaign_id, day_of_week, time, capacity) VALUES ('ca000000-0000-0000-0000-0000000000a1', 4, '12:00', 1)$q$);
SELECT pg_temp.try_as('non-member', 'update session (0 rows = blocked)', 'ok:0',
  $q$UPDATE public.sessions SET capacity = 1 WHERE campaign_id = 'ca000000-0000-0000-0000-0000000000a1'$q$);
SELECT pg_temp.try_as('non-member', 'delete session (0 rows = blocked)', 'ok:0',
  $q$DELETE FROM public.sessions WHERE campaign_id = 'ca000000-0000-0000-0000-0000000000a1'$q$);
SELECT pg_temp.try_as('non-member', 'read event_invites (0 rows = blocked)', 'ok:0', $q$SELECT * FROM public.event_invites$q$);
SELECT pg_temp.try_as('non-member', 'insert event_invite', 'denied',
  $q$INSERT INTO public.event_invites (campaign_id, inviter_id, invitee_email) VALUES ('ca000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-00000000000b', 'z@example.test')$q$);
SELECT pg_temp.try_as('non-member', 'update event_invite (0 rows = blocked)', 'ok:0', $q$UPDATE public.event_invites SET message = 'x'$q$);
SELECT pg_temp.try_as('non-member', 'delete event_invite (0 rows = blocked)', 'ok:0', $q$DELETE FROM public.event_invites$q$);
SELECT pg_temp.try_as('non-member', 'sign up via create_signup_if_capacity', 'ok:1',
  $q$SELECT * FROM public.create_signup_if_capacity('5a000000-0000-0000-0000-0000000000a1', 'ca000000-0000-0000-0000-0000000000a1', 'Signed In Signer', NULL, NULL, '[]'::jsonb)$q$);
RESET ROLE;

SET client_min_messages = notice;
\pset footer off
SELECT n, actor, action, expected, got,
       CASE WHEN got = expected OR (expected = 'denied' AND got LIKE 'denied:%') THEN 'PASS' ELSE 'FAIL' END AS result
FROM rls_results ORDER BY n;

DO $$
DECLARE v_fail int;
BEGIN
  SELECT count(*) INTO v_fail FROM rls_results
  WHERE NOT (got = expected OR (expected = 'denied' AND got LIKE 'denied:%'));
  IF v_fail > 0 THEN RAISE EXCEPTION '% RLS case(s) failed', v_fail; END IF;
  RAISE NOTICE 'all RLS cases passed';
END $$;

ROLLBACK;
