-- The org creator must be able to SELECT their just-inserted row before the owner
-- membership row exists (RETURNING on INSERT runs the SELECT policy).
-- is_org_member() returns false until the membership row is created, so include the
-- creator explicitly.

DROP POLICY IF EXISTS "Members read their organizations" ON public.organizations;

CREATE POLICY "Members and owner read organizations"
    ON public.organizations FOR SELECT
    USING (public.is_org_member(id) OR created_by = auth.uid());
