-- Optional note on each item signup (e.g. "I'll bring scrambled eggs")
ALTER TABLE public.item_signups
  ADD COLUMN IF NOT EXISTS signup_note TEXT;

-- Per-event toggle: show other people's signups on the public event page
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS show_signups_publicly BOOLEAN NOT NULL DEFAULT FALSE;
