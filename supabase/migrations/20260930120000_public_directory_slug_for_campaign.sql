-- Print flyer: show the ward's short directory URL (/w/<slug>) under "or visit"
-- instead of the bare host. Returns the org slug only when the public directory
-- is enabled, so private orgs never leak a slug. Idempotent.

CREATE OR REPLACE FUNCTION public.get_public_directory_slug_for_campaign(p_campaign_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.slug
  FROM public.campaigns c
  JOIN public.organizations o ON o.id = c.organization_id
  WHERE c.id = p_campaign_id
    AND o.public_directory_enabled = true
    AND o.slug IS NOT NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_directory_slug_for_campaign(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_directory_slug_for_campaign(uuid) TO anon, authenticated;
