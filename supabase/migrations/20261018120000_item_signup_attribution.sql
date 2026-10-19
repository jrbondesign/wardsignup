-- First-touch attribution on item signups, same columns PR #69 added to signups
-- (20261016120000_attribution_tracking.sql). Nullable, no backfill.
ALTER TABLE public.item_signups
    ADD COLUMN IF NOT EXISTS first_touch_utm_source TEXT,
    ADD COLUMN IF NOT EXISTS first_touch_utm_medium TEXT,
    ADD COLUMN IF NOT EXISTS first_touch_utm_campaign TEXT,
    ADD COLUMN IF NOT EXISTS first_touch_ref TEXT;

CREATE INDEX IF NOT EXISTS idx_item_signups_first_touch_utm_source
    ON public.item_signups(first_touch_utm_source)
    WHERE first_touch_utm_source IS NOT NULL;
