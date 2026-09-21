-- Public org directory (/w/{slug}): list newest signup sheets first.
-- Filters (published hub, list_on_directory, open/future events) are unchanged.

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
    AND (
      (c.event_type IN ('spots', 'rsvp') AND EXISTS (
        SELECT 1 FROM public.sessions s
        WHERE s.campaign_id = c.id
          AND s.capacity > (
            SELECT COUNT(*) FROM public.signups sig WHERE sig.session_id = s.id
          )
      ))
      OR
      (c.event_type = 'items' AND EXISTS (
        SELECT 1 FROM public.campaign_items ci
        LEFT JOIN public.item_signups isg ON isg.item_id = ci.id
        WHERE ci.campaign_id = c.id
        GROUP BY ci.id, ci.item_limit
        HAVING ci.item_limit IS NULL
          OR COALESCE(SUM(COALESCE(isg.quantity, 1)), 0) < ci.item_limit
      ))
    )
    AND (
      c.event_date IS NULL
      OR c.event_date >= CURRENT_DATE
      OR EXISTS (
        SELECT 1 FROM public.sessions s
        WHERE s.campaign_id = c.id
          AND (s.session_date IS NULL OR s.session_date >= CURRENT_DATE)
      )
    )
  ORDER BY c.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_public_org_campaigns(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_org_campaigns(text) TO anon, authenticated;
