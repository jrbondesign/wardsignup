-- Creator calling (e.g. "Bishop", "Executive secretary", or free text via "Other"),
-- plus organizations.ward_name (Ward/Unit) at the end of this file.
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

-- Ward/Unit name per organization. organizations.name now holds the organization
-- itself (Elders Quorum, Relief Society, Bishopric, Primary); ward_name holds the
-- ward, branch or stake it belongs to. Optional and nullable; existing rows are NOT
-- backfilled (names are not auto split). RLS unchanged: the existing owner only
-- UPDATE policy and member SELECT policies on organizations cover the new column.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ward_name text
    CHECK (ward_name IS NULL OR (char_length(ward_name) BETWEEN 1 AND 120));

COMMENT ON COLUMN public.organizations.ward_name IS
  'Ward/Unit the organization belongs to (ward, branch or stake), shown as "Ward/Unit" in the UI. Optional; set by the owner in first run or org settings.';
