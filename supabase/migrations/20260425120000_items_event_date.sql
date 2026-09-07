-- Add optional event-level date/time columns to campaigns so items-type events
-- (service projects, hurricane cleanup, potlucks) can advertise when they happen.
-- All three fields are nullable to keep "TBD" valid.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS event_date DATE,
  ADD COLUMN IF NOT EXISTS event_start_time TIME,
  ADD COLUMN IF NOT EXISTS event_end_time TIME;
