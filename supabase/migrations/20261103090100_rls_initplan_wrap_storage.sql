-- Fix 5, storage part: same (select auth.*()) wrap for the three event-media
-- write policies on storage.objects. See 20261103090000_rls_initplan_wrap_auth_calls.sql
-- for the why; semantics are unchanged (same names, commands, roles, bucket
-- and own folder checks).
--
-- Separate file because storage.objects is owned by supabase_storage_admin
-- in hosted Supabase, and the postgres role that runs migrations is not a
-- member of it (checked read-only on prod 2026-11-02). DROP POLICY there
-- would fail with "must be owner of table objects" and roll back the whole
-- migration. So this block only runs when the current role can act as the
-- table owner (local Postgres, `supabase start`, or a run as
-- supabase_storage_admin); otherwise it skips with a NOTICE and changes
-- nothing. In that case the same three policies can be edited in the
-- Dashboard storage policy editor, or left as is (event-media writes are
-- rare uploads, so the speedup there is small).
-- Applying this to prod needs Jonathan's own GO.
--
--   storage.objects  Authenticated upload to own folder   (INSERT)
--   storage.objects  Authenticated update own objects     (UPDATE)
--   storage.objects  Authenticated delete own objects     (DELETE)

DO $$
DECLARE
  v_owner oid := (SELECT c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'storage' AND c.relname = 'objects');
BEGIN
  IF v_owner IS NULL OR NOT pg_has_role(current_user, v_owner, 'USAGE') THEN
    RAISE NOTICE 'skipped: % cannot alter policies on storage.objects (owner is %)',
      current_user, coalesce(pg_get_userbyid(v_owner), 'missing');
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "Authenticated upload to own folder" ON storage.objects;
  CREATE POLICY "Authenticated upload to own folder" ON storage.objects
    AS PERMISSIVE FOR INSERT TO public
    WITH CHECK (
      bucket_id = 'event-media'
      AND (select auth.role()) = 'authenticated'
      AND (storage.foldername(name))[1] = (select auth.uid())::text
    );

  DROP POLICY IF EXISTS "Authenticated update own objects" ON storage.objects;
  CREATE POLICY "Authenticated update own objects" ON storage.objects
    AS PERMISSIVE FOR UPDATE TO public
    USING (
      bucket_id = 'event-media'
      AND (select auth.role()) = 'authenticated'
      AND (storage.foldername(name))[1] = (select auth.uid())::text
    );

  DROP POLICY IF EXISTS "Authenticated delete own objects" ON storage.objects;
  CREATE POLICY "Authenticated delete own objects" ON storage.objects
    AS PERMISSIVE FOR DELETE TO public
    USING (
      bucket_id = 'event-media'
      AND (select auth.role()) = 'authenticated'
      AND (storage.foldername(name))[1] = (select auth.uid())::text
    );
END $$;
