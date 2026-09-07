-- PR 4: owner needs to see pending/revoked invites for member management UI.
-- Original policy only let accepted members see member rows.

DROP POLICY IF EXISTS "Members read members of their orgs" ON public.organization_members;

CREATE POLICY "Members and owner read members"
    ON public.organization_members FOR SELECT
    USING (
        public.is_org_member(organization_id)
        OR organization_id IN (
            SELECT id FROM public.organizations WHERE created_by = auth.uid()
        )
    );
