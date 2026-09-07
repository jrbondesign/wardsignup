-- Allow attendees to claim more than 1 unit of an item per signup
-- (e.g. "I'm bringing 2 chainsaws"). Backfills 1 for existing rows.
ALTER TABLE public.item_signups
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1
  CHECK (quantity > 0);
