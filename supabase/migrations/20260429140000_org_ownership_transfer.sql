-- Org ownership transfer: ward secretaries get released and a new one is called.
-- We need a way to hand the keys to a new owner without admin intervention.
--
-- Source-of-truth shift: ownership now lives in `organizations.owner_id` (mutable)
-- and the matching `organization_members` row with role='owner'. `created_by` stays
-- as a historical/audit field but is no longer used for permission checks.

-- 1. owner_id column on organizations, backfilled from created_by.
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

UPDATE public.organizations
SET owner_id = created_by
WHERE owner_id IS NULL;

ALTER TABLE public.organizations
    ALTER COLUMN owner_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_owner_id
    ON public.organizations(owner_id);

-- 2. Exactly one accepted owner per org.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_org_one_owner
    ON public.organization_members(organization_id)
    WHERE role = 'owner' AND status = 'accepted';

-- 3. Flag invites that should transfer ownership on acceptance.
ALTER TABLE public.organization_members
    ADD COLUMN IF NOT EXISTS transfer_on_accept BOOLEAN NOT NULL DEFAULT FALSE;

-- At most one pending handoff per org. Re-issuing requires revoking the prior one.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_org_one_pending_handoff
    ON public.organization_members(organization_id)
    WHERE transfer_on_accept = TRUE AND status = 'pending';

-- 4. Atomic ownership transfer. Demotes current owner to admin, promotes target.
--    Two valid call paths:
--      a) Authenticated current owner (Path A endpoint).
--      b) Service role with no auth context (Path B accept endpoint, which has
--         already validated the invite token + transfer_on_accept flag + email match).
--    NEVER allow an authenticated non-owner caller — including the new-owner-elect.
--    Otherwise any co-admin could self-promote by passing their own user_id.
CREATE OR REPLACE FUNCTION public.transfer_organization_ownership(
    p_org_id UUID,
    p_new_owner_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_owner UUID;
    v_caller UUID;
    v_target_status TEXT;
    v_target_member_id UUID;
    v_old_owner_member_id UUID;
BEGIN
    SELECT owner_id INTO v_current_owner
    FROM public.organizations
    WHERE id = p_org_id;

    IF v_current_owner IS NULL THEN
        RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002';
    END IF;

    v_caller := auth.uid();

    -- Authenticated callers must be the current owner. Service role (auth.uid() is
    -- NULL) is allowed and is used by the accept endpoint after it has verified the
    -- invite's transfer_on_accept flag and the invitee's email.
    IF v_caller IS NOT NULL AND v_caller <> v_current_owner THEN
        RAISE EXCEPTION 'Only the current owner can transfer ownership'
            USING ERRCODE = '42501';
    END IF;

    IF v_current_owner = p_new_owner_user_id THEN
        RAISE EXCEPTION 'Target user is already the owner'
            USING ERRCODE = '22023';
    END IF;

    -- Target must be an accepted member with a real user_id.
    SELECT id, status INTO v_target_member_id, v_target_status
    FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = p_new_owner_user_id;

    IF v_target_member_id IS NULL THEN
        RAISE EXCEPTION 'Target user is not a member of this organization'
            USING ERRCODE = '22023';
    END IF;
    IF v_target_status <> 'accepted' THEN
        RAISE EXCEPTION 'Target member must accept their invitation first'
            USING ERRCODE = '22023';
    END IF;

    SELECT id INTO v_old_owner_member_id
    FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = v_current_owner
      AND role = 'owner'
      AND status = 'accepted';

    IF v_old_owner_member_id IS NULL THEN
        RAISE EXCEPTION 'Current owner has no owner membership row'
            USING ERRCODE = 'P0002';
    END IF;

    -- Demote first to free the partial unique index (one accepted owner per org),
    -- then promote the target.
    UPDATE public.organization_members
    SET role = 'admin'
    WHERE id = v_old_owner_member_id;

    UPDATE public.organization_members
    SET role = 'owner'
    WHERE id = v_target_member_id;

    UPDATE public.organizations
    SET owner_id = p_new_owner_user_id
    WHERE id = p_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_organization_ownership(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_organization_ownership(UUID, UUID) TO authenticated;

-- 5. Swap owner-keyed RLS policies from created_by to owner_id.
DROP POLICY IF EXISTS "Owner updates organization" ON public.organizations;
CREATE POLICY "Owner updates organization"
    ON public.organizations FOR UPDATE
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owner manages members" ON public.organization_members;
CREATE POLICY "Owner manages members"
    ON public.organization_members FOR ALL
    USING (
        organization_id IN (
            SELECT id FROM public.organizations WHERE owner_id = auth.uid()
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT id FROM public.organizations WHERE owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Members and owner read members" ON public.organization_members;
CREATE POLICY "Members and owner read members"
    ON public.organization_members FOR SELECT
    USING (
        public.is_org_member(organization_id)
        OR organization_id IN (
            SELECT id FROM public.organizations WHERE owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Members and owner read organizations" ON public.organizations;
CREATE POLICY "Members and owner read organizations"
    ON public.organizations FOR SELECT
    USING (public.is_org_member(id) OR owner_id = auth.uid());

-- Campaign delete also keyed off org owner.
DROP POLICY IF EXISTS "Org owner deletes campaign" ON public.campaigns;
CREATE POLICY "Org owner deletes campaign"
    ON public.campaigns FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.organizations o
            WHERE o.id = campaigns.organization_id
              AND o.owner_id = auth.uid()
        )
    );
