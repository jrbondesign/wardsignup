-- Multiple labeled times AND locations per event (e.g. temple trips have a
-- "Meet at church" location & departure time, plus a "Temple" location &
-- session time). Stored as JSONB arrays for flexibility.
--
-- event_times:     [{ "label": "Meet at church", "time": "07:30" }, ...]
-- event_locations: [{ "label": "Meeting point", "address": "Stake center" }, ...]

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS event_times     JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS event_locations JSONB NOT NULL DEFAULT '[]'::jsonb;
