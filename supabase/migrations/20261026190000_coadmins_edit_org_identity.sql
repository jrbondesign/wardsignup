-- Let accepted co-admins change the organization name and Ward/Unit, alongside
-- the directory fields they could already change. Everything else on
-- organizations (owner_id, brand_id, created_by, ...) stays owner only.
--
-- RLS is unchanged: "Org members update directory" (is_org_member) already lets
-- accepted members UPDATE the row; this BEFORE UPDATE trigger is what limits
-- which columns they may change. This only widens that column list:
--   slug, public_directory_enabled   (already allowed)
--   name, ward_name                  (new)
--   needs_naming                     (new, and only true -> false, i.e. naming it)
-- No data changes. Safe to re-run.

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

  -- Co-admins may name the org (clear needs_naming) but never flag it again.
  IF NEW.needs_naming IS DISTINCT FROM OLD.needs_naming AND NEW.needs_naming IS NOT FALSE THEN
    RAISE EXCEPTION 'Only the owner can change organization fields other than name, Ward/Unit and directory settings'
      USING ERRCODE = '42501';
  END IF;

  IF (to_jsonb(NEW) - ARRAY['slug', 'public_directory_enabled', 'name', 'ward_name', 'needs_naming'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['slug', 'public_directory_enabled', 'name', 'ward_name', 'needs_naming'])
  THEN
    RAISE EXCEPTION 'Only the owner can change organization fields other than name, Ward/Unit and directory settings'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
