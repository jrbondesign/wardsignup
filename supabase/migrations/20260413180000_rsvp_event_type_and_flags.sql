-- Migration: Add 'rsvp' event type + allow_guests + show_capacity_publicly
-- Safe: all changes are additive. Existing spots/items events are unaffected.

-- 1. Expand the event_type check constraint to include 'rsvp'
ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_event_type_check;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_event_type_check
  CHECK (event_type IN ('spots', 'items', 'rsvp'));

-- 2. allow_guests — controls whether guest name fields appear on the public page.
--    Default TRUE preserves existing behavior (Fathers & Sons campout uses guests).
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS allow_guests BOOLEAN NOT NULL DEFAULT true;

-- 3. show_capacity_publicly — controls whether "X spots remaining" is shown.
--    Default TRUE matches the current always-visible behavior.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS show_capacity_publicly BOOLEAN NOT NULL DEFAULT true;
