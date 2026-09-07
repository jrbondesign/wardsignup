-- Expose new event-level date/time/location fields through the public campaign RPC
-- so the public signup page (anon role) can read them.
DROP FUNCTION IF EXISTS public.get_public_campaign(uuid);

CREATE OR REPLACE FUNCTION public.get_public_campaign(campaign_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  cover_image_url text,
  organizer_logo_url text,
  event_date date,
  event_start_time text,
  event_end_time text,
  event_times jsonb,
  event_locations jsonb
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
    c.event_start_time,
    c.event_end_time,
    c.event_times,
    c.event_locations
  FROM public.campaigns c
  LEFT JOIN public.organizer_profiles op
    ON op.user_id = c.created_by
   AND op.brand_id = c.brand_id
  WHERE c.id = campaign_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_campaign(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_campaign(uuid) TO anon, authenticated;
