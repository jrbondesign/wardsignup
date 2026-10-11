-- Queue for non urgent email (welcome, digests, reports, feedback asks,
-- announcements, new creator notices) so it goes out after Resend's daily
-- quota resets at 00:00 UTC. Drained by /api/cron/email-queue at 00:07 UTC.
-- Service role only; RLS on with no policies.

CREATE TABLE IF NOT EXISTS public.email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  category text NOT NULL CHECK (category IN ('notification', 'transactional')),
  kind text NOT NULL,
  from_address text NOT NULL,
  to_address text NOT NULL,
  subject text NOT NULL,
  html text NOT NULL,
  text_body text,
  reply_to text,
  attachments jsonb,
  send_after timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS email_queue_due_idx
  ON public.email_queue (send_after)
  WHERE status = 'pending';

ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.email_queue IS 'Non urgent email waiting for the next UTC quota reset; service role only.';
