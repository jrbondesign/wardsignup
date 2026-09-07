-- Step 3: Extend get_public_campaign RPC to return cover image + organizer logo
-- Must DROP first because PostgreSQL won't allow changing return type via CREATE OR REPLACE
DROP FUNCTION IF EXISTS public.get_public_campaign(uuid);
CREATE OR REPLACE FUNCTION public.get_public_campaign(campaign_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  cover_image_url text,
  organizer_logo_url text
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
    op.logo_url AS organizer_logo_url
  FROM public.campaigns c
  LEFT JOIN public.organizer_profiles op ON op.user_id = c.created_by
  WHERE c.id = campaign_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_campaign(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_campaign(uuid) TO anon, authenticated;
