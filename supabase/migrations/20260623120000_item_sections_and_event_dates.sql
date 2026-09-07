-- Items events: group/section labels + multi-date (display-only) support.
--
-- 1. campaign_items.section — optional grouping label (e.g. "Women's Side" /
--    "Men's Side"). NULL = ungrouped, which is every existing item. The public
--    page renders one header per distinct section.
--
-- 2. campaigns.event_dates — JSONB array of ISO date strings ("YYYY-MM-DD") for
--    items events that recur across several dates (e.g. 3 Thursdays). This is
--    DISPLAY-ONLY: a single claim covers all the dates. The existing
--    event_start_time / event_end_time apply to the whole set. Existing
--    single-date events keep using event_date; event_dates defaults to [].
--
-- NOTE (multi-brand): this migration MUST be applied to every brand's Supabase
-- project (wardsignup AND ministrysignup), not just one. See CLAUDE.md.

ALTER TABLE public.campaign_items
  ADD COLUMN IF NOT EXISTS section TEXT;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS event_dates JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Expose event_dates through the public campaign RPC so the anon role on the
-- public signup page can read it. Recreates the function from its current
-- definition (20260429120000) with event_dates appended — keep every existing
-- column so we don't regress event_end_date / event_type / visibility flags.
DROP FUNCTION IF EXISTS public.get_public_campaign(uuid);

CREATE OR REPLACE FUNCTION public.get_public_campaign(campaign_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  cover_image_url text,
  organizer_logo_url text,
  event_date date,
  event_end_date date,
  event_start_time text,
  event_end_time text,
  event_times jsonb,
  event_locations jsonb,
  event_type text,
  show_signups_publicly boolean,
  allow_guests boolean,
  show_capacity_publicly boolean,
  event_dates jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.description,
    c.cover_image_url,
    op.logo_url AS organizer_logo_url,
    c.event_date,
    c.event_end_date,
    c.event_start_time,
    c.event_end_time,
    c.event_times,
    c.event_locations,
    c.event_type,
    c.show_signups_publicly,
    c.allow_guests,
    c.show_capacity_publicly,
    c.event_dates
  FROM public.campaigns c
  LEFT JOIN public.organizer_profiles op
    ON op.user_id = c.created_by
   AND op.brand_id = c.brand_id
  WHERE c.id = campaign_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_campaign(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_campaign(uuid) TO anon, authenticated;
