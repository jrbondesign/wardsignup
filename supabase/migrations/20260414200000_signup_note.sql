-- Add optional note field to signups (spots/rsvp events)
-- Already exists on item_signups; this brings parity for session-based signups.
ALTER TABLE public.signups
  ADD COLUMN IF NOT EXISTS signup_note TEXT;
