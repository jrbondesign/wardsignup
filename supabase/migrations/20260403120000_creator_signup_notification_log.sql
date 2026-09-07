-- Dedupe "new creator" founder emails by normalized email (same address re-signing up = one notify).
CREATE TABLE IF NOT EXISTS public.creator_signup_notification_log (
  email text PRIMARY KEY,
  notified_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.creator_signup_notification_log IS
  'Stores lowercased creator emails already reported to the founder; insert before sending founder notify.';

ALTER TABLE public.creator_signup_notification_log ENABLE ROW LEVEL SECURITY;
