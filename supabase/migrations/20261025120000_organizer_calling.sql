-- Creator calling (e.g. "Bishop", "Executive secretary", or free text via "Other").
--
-- Calling is per person, so it lives on organizer_profiles (one row per user per
-- brand), next to the other creator answers (heard_about_*, first_touch_*). The
-- ward name is per organization and is already organizations.name.
--
-- RLS: no new policies needed. organizer_profiles already has RLS enabled with
-- own row SELECT / INSERT / UPDATE (auth.uid() = user_id), and the explicit Data
-- API grants (20261020120000) are table level, so they cover the new columns.
-- Other ward members cannot read a creator's calling; service_role (admin
-- metrics) can.

ALTER TABLE public.organizer_profiles
  ADD COLUMN IF NOT EXISTS calling text
    CHECK (calling IS NULL OR (char_length(calling) BETWEEN 1 AND 80)),
  ADD COLUMN IF NOT EXISTS calling_updated_at timestamptz;

COMMENT ON COLUMN public.organizer_profiles.calling IS
  'Creator''s calling as shown in the UI: a picklist label (e.g. "Bishop") or free text from "Other". Optional, editable in org settings.';
COMMENT ON COLUMN public.organizer_profiles.calling_updated_at IS
  'When calling was last set or cleared.';
