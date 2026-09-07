-- Authenticated users can create their own organization for any brand. The follow-on
-- owner membership row insert is already permitted by the "Owner manages members"
-- policy on organization_members.

CREATE POLICY "Users insert own organization"
    ON public.organizations FOR INSERT
    WITH CHECK (created_by = auth.uid());
