-- When a row was claimed (pending to sending) by /api/cron/email-queue.
-- Lets the drain recover rows left in 'sending' by a run that crashed or
-- timed out between the claim and the result write.
ALTER TABLE public.email_queue ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- Rows already stuck in 'sending' get a claim time now, so the next run
-- older than the recovery threshold picks them up.
UPDATE public.email_queue SET claimed_at = now() WHERE status = 'sending' AND claimed_at IS NULL;

CREATE INDEX IF NOT EXISTS email_queue_sending_idx
  ON public.email_queue (claimed_at)
  WHERE status = 'sending';
