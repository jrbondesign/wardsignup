-- Disposable local Postgres proof for 20261111210000_allow_custom_items_toggle.
-- Run against a THROWAWAY database that already has every earlier migration
-- applied (never a hosted database):
--   psql -v ON_ERROR_STOP=1 -d <scratch_db> -v mig=supabase/migrations/20261111210000_allow_custom_items_toggle.sql \
--        -f scripts/allow-custom-items-pg-proof.sql
-- Prints "allow_custom_items postgres proof ok" on success; raises otherwise.
\set QUIET on
SET client_min_messages = warning;

-- Fixture rows (FK checks skipped: this is a scratch database).
SET session_replication_role = replica;
INSERT INTO public.campaigns (id, name, event_type, organization_id, show_signups_publicly)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Potluck', 'items', gen_random_uuid(), true);
INSERT INTO public.campaign_items (id, campaign_id, label, item_limit)
VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rolls', 5);
SET session_replication_role = origin;

-- Before the migration: write-ins work and the column does not exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campaigns' AND column_name = 'allow_custom_items') THEN
    RAISE EXCEPTION 'column already present before migration';
  END IF;
  PERFORM public.create_item_signup_if_capacity('aaaaaaaa-0000-0000-0000-000000000001', 'Pre', NULL, NULL, NULL, 1, 'Pre-migration trailer');
END $$;

-- Simulate a database that still has the legacy policy, so the migration's
-- conditional replacement is exercised too (production does not have it).
CREATE POLICY "Public insert custom item_signups"
  ON public.item_signups FOR INSERT
  WITH CHECK (custom_label IS NOT NULL AND char_length(custom_label) > 0 AND char_length(custom_label) <= 200);

\i :mig
-- Idempotent: a second run must succeed.
\i :mig

DO $$
DECLARE
  r public.item_signups;
  pub record;
  page jsonb;
  pol text;
BEGIN
  -- Existing event defaults to on.
  IF (SELECT allow_custom_items FROM public.campaigns WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'existing event did not default to true';
  END IF;

  -- On: write-in allowed through the RPC.
  r := public.create_item_signup_if_capacity('aaaaaaaa-0000-0000-0000-000000000001', 'Ann', NULL, NULL, NULL, 1, 'A generator');
  IF r.custom_label <> 'A generator' THEN RAISE EXCEPTION 'write-in not stored'; END IF;

  -- Public payloads carry the flag.
  SELECT * INTO pub FROM public.get_public_campaign('aaaaaaaa-0000-0000-0000-000000000001');
  IF pub.allow_custom_items IS DISTINCT FROM true THEN RAISE EXCEPTION 'get_public_campaign missing flag'; END IF;
  page := public.get_public_event_page('aaaaaaaa-0000-0000-0000-000000000001');
  IF (page->'event'->>'allow_custom_items') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'get_public_event_page missing flag: %', page->'event'; END IF;

  -- Off: write-in rejected, listed item still fine.
  UPDATE public.campaigns SET allow_custom_items = false WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  BEGIN
    PERFORM public.create_item_signup_if_capacity('aaaaaaaa-0000-0000-0000-000000000001', 'Bob', NULL, NULL, NULL, 1, 'Extra chairs');
    RAISE EXCEPTION 'write-in was accepted while off';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'CUSTOM_ITEMS_DISABLED' THEN RAISE; END IF;
  END;
  r := public.create_item_signup_if_capacity('aaaaaaaa-0000-0000-0000-000000000001', 'Bob', 'bbbbbbbb-0000-0000-0000-000000000001', NULL, NULL, 2, NULL);
  IF r.item_id IS NULL OR r.quantity <> 2 THEN RAISE EXCEPTION 'listed item signup failed while off'; END IF;
  page := public.get_public_event_page('aaaaaaaa-0000-0000-0000-000000000001');
  IF (page->'event'->>'allow_custom_items') IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'page flag not false'; END IF;

  -- Missing campaign still reports CAMPAIGN_NOT_FOUND.
  BEGIN
    PERFORM public.create_item_signup_if_capacity(gen_random_uuid(), 'X', NULL, NULL, NULL, 1, 'thing');
    RAISE EXCEPTION 'missing campaign accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'CAMPAIGN_NOT_FOUND' THEN RAISE; END IF;
  END;

  -- Legacy policy now also requires the flag.
  SELECT with_check INTO pol FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'item_signups' AND policyname = 'Public insert custom item_signups';
  IF pol IS NULL OR pol NOT LIKE '%allow_custom_items%' THEN RAISE EXCEPTION 'legacy policy not gated: %', pol; END IF;
END $$;

-- RLS: a non-bypass role with an INSERT grant (only possible on a database
-- that still has the legacy policy and grant) is held to the flag.
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aci_rls_tester') THEN CREATE ROLE aci_rls_tester NOLOGIN; END IF; END $$;
GRANT USAGE ON SCHEMA public TO aci_rls_tester;
GRANT INSERT ON public.item_signups TO aci_rls_tester;
GRANT SELECT ON public.campaigns TO aci_rls_tester;
DO $$ BEGIN
  -- campaigns RLS may hide the row from this role; give it a read policy for the proof.
  CREATE POLICY aci_proof_read ON public.campaigns FOR SELECT TO aci_rls_tester USING (true);
END $$;

SET ROLE aci_rls_tester;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.item_signups (campaign_id, member_name, custom_label)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Rls Off', 'Generator');
    RAISE EXCEPTION 'RLS let a write-in through while off';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected: new row violates row-level security policy
  END;
END $$;
RESET ROLE;
UPDATE public.campaigns SET allow_custom_items = true WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SET ROLE aci_rls_tester;
INSERT INTO public.item_signups (campaign_id, member_name, custom_label)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Rls On', 'Generator');
RESET ROLE;

-- anon still cannot call the RPC or insert directly.
SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.create_item_signup_if_capacity('aaaaaaaa-0000-0000-0000-000000000001', 'Anon', NULL, NULL, NULL, 1, 'x');
    RAISE EXCEPTION 'anon executed the RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.item_signups (campaign_id, member_name, custom_label) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Anon', 'x');
    RAISE EXCEPTION 'anon inserted directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SELECT 'allow_custom_items postgres proof ok' AS result;
