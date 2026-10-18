-- Attribution tracking: capture first-touch UTM params and ref for signups, creators, and orgs
-- This enables reporting on which channels drive new creators (e.g., ref=share, signup_sheet/referral).

-- Track attribution for each signup (participant attribution)
ALTER TABLE public.signups
    ADD COLUMN IF NOT EXISTS first_touch_utm_source TEXT,
    ADD COLUMN IF NOT EXISTS first_touch_utm_medium TEXT,
    ADD COLUMN IF NOT EXISTS first_touch_utm_campaign TEXT,
    ADD COLUMN IF NOT EXISTS first_touch_ref TEXT;

CREATE INDEX IF NOT EXISTS idx_signups_attribution_source 
    ON public.signups(first_touch_utm_source) 
    WHERE first_touch_utm_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signups_attribution_ref 
    ON public.signups(first_touch_ref) 
    WHERE first_touch_ref IS NOT NULL;

-- Track attribution for creator accounts (organizer_profiles)
-- When a participant later becomes a creator, this captures their original first touch.
ALTER TABLE public.organizer_profiles
    ADD COLUMN IF NOT EXISTS first_touch_utm_source TEXT,
    ADD COLUMN IF NOT EXISTS first_touch_utm_medium TEXT,
    ADD COLUMN IF NOT EXISTS first_touch_utm_campaign TEXT,
    ADD COLUMN IF NOT EXISTS first_touch_ref TEXT,
    ADD COLUMN IF NOT EXISTS first_touch_captured_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_organizer_profiles_attribution_source 
    ON public.organizer_profiles(first_touch_utm_source) 
    WHERE first_touch_utm_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizer_profiles_attribution_ref 
    ON public.organizer_profiles(first_touch_ref) 
    WHERE first_touch_ref IS NOT NULL;

COMMENT ON COLUMN public.organizer_profiles.first_touch_utm_source IS 
    'First-touch attribution source (e.g., "email", "qr", "signup_sheet")';
COMMENT ON COLUMN public.organizer_profiles.first_touch_utm_medium IS 
    'First-touch attribution medium (e.g., "email", "referral", "print")';
COMMENT ON COLUMN public.organizer_profiles.first_touch_utm_campaign IS 
    'First-touch attribution campaign (e.g., "daily_summary", "made_with")';
COMMENT ON COLUMN public.organizer_profiles.first_touch_ref IS 
    'First-touch ref parameter (e.g., "share" for user-shared links)';

-- Track attribution for organizations (org-level first touch)
-- When an org is created, capture the creator's attribution at that moment.
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS first_touch_utm_source TEXT,
    ADD COLUMN IF NOT EXISTS first_touch_utm_medium TEXT,
    ADD COLUMN IF NOT EXISTS first_touch_utm_campaign TEXT,
    ADD COLUMN IF NOT EXISTS first_touch_ref TEXT,
    ADD COLUMN IF NOT EXISTS first_touch_captured_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_organizations_attribution_source 
    ON public.organizations(first_touch_utm_source) 
    WHERE first_touch_utm_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_attribution_ref 
    ON public.organizations(first_touch_ref) 
    WHERE first_touch_ref IS NOT NULL;

COMMENT ON COLUMN public.organizations.first_touch_utm_source IS 
    'Creator first-touch attribution source when org was created';
COMMENT ON COLUMN public.organizations.first_touch_utm_medium IS 
    'Creator first-touch attribution medium when org was created';
COMMENT ON COLUMN public.organizations.first_touch_utm_campaign IS 
    'Creator first-touch attribution campaign when org was created';
COMMENT ON COLUMN public.organizations.first_touch_ref IS 
    'Creator first-touch ref parameter when org was created';

-- Example queries for attribution analysis:
-- 
-- 1. New creators from share links:
-- SELECT COUNT(*) FROM public.organizer_profiles WHERE first_touch_ref = 'share';
-- 
-- 2. New creators from "Made with" footer:
-- SELECT COUNT(*) FROM public.organizer_profiles 
-- WHERE first_touch_utm_source = 'signup_sheet' 
--   AND first_touch_utm_medium = 'referral' 
--   AND first_touch_utm_campaign = 'made_with';
--
-- 3. Attribution breakdown of new creators by source (past 30 days):
-- SELECT 
--     COALESCE(first_touch_utm_source, 'Direct') as source,
--     COALESCE(first_touch_utm_medium, '') as medium,
--     COALESCE(first_touch_utm_campaign, '') as campaign,
--     first_touch_ref as ref,
--     COUNT(*) as creator_count
-- FROM public.organizer_profiles
-- WHERE created_at >= NOW() - INTERVAL '30 days'
-- GROUP BY first_touch_utm_source, first_touch_utm_medium, first_touch_utm_campaign, first_touch_ref
-- ORDER BY creator_count DESC;
