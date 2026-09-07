-- Organizations: unit of ownership for campaigns. One org per (creator, brand) seeded from
-- existing data. organization_id on campaigns is added nullable here; PR 3 makes it NOT NULL
-- after the app has been updated to set it on every new campaign.

CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- True for orgs created by the backfill below; the app forces a rename before use.
    needs_naming BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_organizations_brand_creator
    ON public.organizations(brand_id, created_by);

CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- Null until invitee accepts (account may not exist yet at invite time).
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    invited_email TEXT NOT NULL,
    invited_by UUID NOT NULL REFERENCES auth.users(id),
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'revoked')),
    accept_token TEXT UNIQUE,
    token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    UNIQUE (organization_id, invited_email)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user
    ON public.organization_members(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_members_org
    ON public.organization_members(organization_id);

ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

CREATE INDEX IF NOT EXISTS idx_campaigns_organization_id
    ON public.campaigns(organization_id);

-- One org per distinct (created_by, brand_id) found in existing campaigns.
-- Placeholder name + needs_naming flag forces the user to rename on next login.
INSERT INTO public.organizations (brand_id, name, created_by, needs_naming)
SELECT DISTINCT
    COALESCE(brand_id, 'wardsignup') AS brand_id,
    'Untitled organization' AS name,
    created_by,
    TRUE AS needs_naming
FROM public.campaigns
WHERE created_by IS NOT NULL;

-- Owner membership row for each backfilled org.
INSERT INTO public.organization_members
    (organization_id, user_id, invited_email, invited_by, role, status, accepted_at)
SELECT
    o.id,
    o.created_by,
    COALESCE(u.email, ''),
    o.created_by,
    'owner',
    'accepted',
    NOW()
FROM public.organizations o
JOIN auth.users u ON u.id = o.created_by;

-- Link existing campaigns to their owner's org (matching brand).
UPDATE public.campaigns c
SET organization_id = o.id
FROM public.organizations o
WHERE o.created_by = c.created_by
  AND o.brand_id = COALESCE(c.brand_id, 'wardsignup')
  AND c.organization_id IS NULL;

-- RLS: avoid recursion on organization_members SELECT by routing membership checks
-- through a SECURITY DEFINER helper.
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE organization_id = p_org_id
          AND user_id = auth.uid()
          AND status = 'accepted'
    );
$$;

REVOKE ALL ON FUNCTION public.is_org_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID) TO authenticated;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their organizations"
    ON public.organizations FOR SELECT
    USING (public.is_org_member(id));

CREATE POLICY "Owner updates organization"
    ON public.organizations FOR UPDATE
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Members read members of their orgs"
    ON public.organization_members FOR SELECT
    USING (public.is_org_member(organization_id));

CREATE POLICY "Owner manages members"
    ON public.organization_members FOR ALL
    USING (
        organization_id IN (
            SELECT id FROM public.organizations WHERE created_by = auth.uid()
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT id FROM public.organizations WHERE created_by = auth.uid()
        )
    );
