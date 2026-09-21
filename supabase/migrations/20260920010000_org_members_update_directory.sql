-- Let accepted org members update only slug + public_directory_enabled.
-- Full org UPDATE stays owner-only for name, ownership, and other columns.

DROP POLICY IF EXISTS "Org members update directory" ON public.organizations;
CREATE POLICY "Org members update directory"
    ON public.organizations FOR UPDATE
    USING (public.is_org_member(id))
    WITH CHECK (public.is_org_member(id));

CREATE OR REPLACE FUNCTION public.restrict_org_member_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service-role / no JWT (migrations, admin scripts): do not block.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Owners may change any column (name, transfer, etc.).
  IF OLD.owner_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_org_member(NEW.id) THEN
    RAISE EXCEPTION 'Not authorized to update this organization'
      USING ERRCODE = '42501';
  END IF;

  IF (to_jsonb(NEW) - ARRAY['slug', 'public_directory_enabled'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['slug', 'public_directory_enabled'])
  THEN
    RAISE EXCEPTION 'Only the owner can change organization fields other than directory settings'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_restrict_member_updates ON public.organizations;
CREATE TRIGGER organizations_restrict_member_updates
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION public.restrict_org_member_updates();
