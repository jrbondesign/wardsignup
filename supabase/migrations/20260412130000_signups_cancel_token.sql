-- Add cancel_token to signups so participants can cancel without logging in.
-- gen_random_uuid() auto-populates existing rows.
ALTER TABLE public.signups
  ADD COLUMN IF NOT EXISTS cancel_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS signups_cancel_token_key
  ON public.signups(cancel_token);
