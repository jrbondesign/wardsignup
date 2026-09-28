-- Medium findings: lock rate/cron RPCs, revoke public execute on
-- create_signup_if_capacity, hide session notes from anon, hash invite tokens.
-- Idempotent / safe to re-run.
--
-- Paste-ready in Supabase SQL editor (same as this file). One shared project
-- covers both Vercel brands today.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- M2 — rate-limit and cron claim RPCs: service_role only
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.try_consume_signup_rate(text, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.try_consume_signup_rate(text, timestamptz, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_consume_signup_rate(text, timestamptz, integer) TO service_role;

REVOKE ALL ON FUNCTION public.try_consume_action_rate(text, text, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.try_consume_action_rate(text, text, timestamptz, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_consume_action_rate(text, text, timestamptz, integer) TO service_role;

REVOKE ALL ON FUNCTION public.try_claim_cron_run(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.try_claim_cron_run(text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_claim_cron_run(text, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- M1 — session signup RPC is no longer callable with the anon key
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.create_signup_if_capacity(uuid, uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_signup_if_capacity(uuid, uuid, text, text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_signup_if_capacity(uuid, uuid, text, text, text, jsonb) TO service_role;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.create_signup_if_capacity(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
EXCEPTION
  WHEN undefined_function THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- M3 — session notes are organizer-only; public pages use sessions_public
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can read sessions" ON public.sessions;

DROP POLICY IF EXISTS "Org members read sessions" ON public.sessions;
CREATE POLICY "Org members read sessions"
  ON public.sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id
        AND public.is_org_member(c.organization_id)
    )
  );

CREATE OR REPLACE VIEW public.sessions_public
WITH (security_invoker = false) AS
SELECT
    s.id,
    s.campaign_id,
    s.day_of_week,
    s.time,
    s.end_time,
    s.capacity,
    s.location,
    s.session_date,
    s.label,
    s.section,
    s.sort_order,
    s.created_at,
    s.updated_at
FROM public.sessions s;

GRANT SELECT ON public.sessions_public TO anon, authenticated;

-- campaign_items stay world-readable: labels, limits, and sort are required
-- on the public signup page and there is no organizer-only column.

-- ---------------------------------------------------------------------------
-- M5 — hash stored invite tokens; hide accept_token from member SELECT *
-- ---------------------------------------------------------------------------

UPDATE public.organization_members
SET accept_token = 'h1:' || encode(sha256(convert_to(accept_token, 'UTF8')), 'hex')
WHERE accept_token IS NOT NULL
  AND accept_token NOT LIKE 'h1:%';

REVOKE SELECT (accept_token) ON public.organization_members FROM anon;
REVOKE SELECT (accept_token) ON public.organization_members FROM authenticated;
