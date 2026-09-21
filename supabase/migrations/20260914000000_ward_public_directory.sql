-- Ward public directory MVP: allow orgs to publish a public hub page at /w/[slug]
-- showing their open/accepting-signups events with no PII.

-- 1. Add slug column to organizations (nullable, unique)
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_organizations_slug
    ON public.organizations(slug) WHERE slug IS NOT NULL;

-- 2. Add public_directory_enabled flag (default OFF)
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS public_directory_enabled BOOLEAN NOT NULL DEFAULT false;

-- 3. Add list_on_directory flag to campaigns (default true, only applies when org hub enabled)
ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS list_on_directory BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_campaigns_directory_listing
    ON public.campaigns(organization_id, list_on_directory)
    WHERE list_on_directory = true;

-- 4. SECURITY DEFINER RPC for public access to org campaigns
-- Pattern: existing get_public_campaign RPC
DROP FUNCTION IF EXISTS public.get_public_org_campaigns(text);

CREATE OR REPLACE FUNCTION public.get_public_org_campaigns(p_slug text)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  event_date date,
  event_end_date date,
  event_start_time text,
  event_end_time text,
  event_times jsonb,
  event_locations jsonb,
  event_type text
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
    c.event_date,
    c.event_end_date,
    c.event_start_time,
    c.event_end_time,
    c.event_times,
    c.event_locations,
    c.event_type
  FROM public.campaigns c
  JOIN public.organizations o ON o.id = c.organization_id
  WHERE o.slug = p_slug
    AND o.public_directory_enabled = true
    AND c.list_on_directory = true
    -- Only show open/accepting-signups events
    AND (
      -- For 'spots' and 'rsvp' events: at least one session has capacity
      (c.event_type IN ('spots', 'rsvp') AND EXISTS (
        SELECT 1 FROM public.sessions s
        WHERE s.campaign_id = c.id
          AND s.capacity > (
            SELECT COUNT(*) FROM public.signups sig WHERE sig.session_id = s.id
          )
      ))
      OR
      -- For 'items' events: at least one item is not fully claimed
      (c.event_type = 'items' AND EXISTS (
        SELECT 1 FROM public.campaign_items ci
        LEFT JOIN public.item_signups isg ON isg.item_id = ci.id
        WHERE ci.campaign_id = c.id
        GROUP BY ci.id, ci.item_limit
        HAVING ci.item_limit IS NULL
          OR COALESCE(SUM(COALESCE(isg.quantity, 1)), 0) < ci.item_limit
      ))
    )
    -- Show only future sessions (or recurring ones without a date)
    AND (
      c.event_date IS NULL
      OR c.event_date >= CURRENT_DATE
      OR EXISTS (
        SELECT 1 FROM public.sessions s
        WHERE s.campaign_id = c.id
          AND (s.session_date IS NULL OR s.session_date >= CURRENT_DATE)
      )
    )
  ORDER BY COALESCE(c.event_date, '2099-12-31'::date), c.created_at;
$$;

REVOKE ALL ON FUNCTION public.get_public_org_campaigns(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_org_campaigns(text) TO anon, authenticated;
