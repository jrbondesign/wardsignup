-- Extend get_public_campaign so anonymous visitors can read non-PII visibility flags
-- they need to render the public event page (event_type, show_signups_publicly,
-- allow_guests, show_capacity_publicly).
--
-- Background: PR #7 replaced the campaigns SELECT policy with `is_org_member()`,
-- which (correctly) blocks anon visitors from `select * from campaigns`. The
-- public event page used to make a direct table read for these flags; that path
-- now returns empty for anon, which silently set show_signups_publicly = false on
-- every public page render.
--
-- Routing the read through the SECURITY DEFINER RPC fixes it without re-opening
-- a wide-open SELECT policy on campaigns.

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
  show_capacity_publicly boolean
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
    c.show_capacity_publicly
  FROM public.campaigns c
  LEFT JOIN public.organizer_profiles op
    ON op.user_id = c.created_by
   AND op.brand_id = c.brand_id
  WHERE c.id = campaign_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_campaign(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_campaign(uuid) TO anon, authenticated;
