-- One email a day about signups.
-- 1. leader_signup_email_enabled column added (now deprecated; see PR #81 Oct 2026).
-- 2. Faster alerts stay off by default for new events (column default is
--    already false); events that had them on are folded into the daily digest.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS leader_signup_email_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.campaigns.leader_signup_email_enabled IS
  'DEPRECATED: Per-signup leader emails disabled Oct 2026. Leaders now receive the daily digest only. Column kept for backward compatibility.';

ALTER TABLE public.campaigns
  ALTER COLUMN organizer_instant_notify_enabled SET DEFAULT false;

-- Fold existing faster alert events into the daily digest.
UPDATE public.campaigns
SET organizer_digest_enabled = true,
    organizer_instant_notify_enabled = false
WHERE organizer_instant_notify_enabled = true;
