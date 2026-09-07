-- One welcome email per auth user (race-safe vs concurrent /api/welcome calls).
CREATE TABLE IF NOT EXISTS public.welcome_email_sent (
  user_id uuid PRIMARY KEY,
  sent_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.welcome_email_sent IS
  'Claim row before sending welcome email; duplicate user_id skips send.';

ALTER TABLE public.welcome_email_sent ENABLE ROW LEVEL SECURITY;
