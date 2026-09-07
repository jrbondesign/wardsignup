-- Safety net: catch campaigns created between the PR 1 (schema) and PR 2 (app wiring)
-- deploys that have organization_id = NULL. Idempotent: matches PR 1's backfill logic
-- but only touches the affected rows.

-- 1. Create placeholder orgs for any creators who landed during the gap and have no org
--    for the campaign's brand yet.
INSERT INTO public.organizations (brand_id, name, created_by, needs_naming)
SELECT DISTINCT
    COALESCE(c.brand_id, 'wardsignup') AS brand_id,
    'Untitled organization' AS name,
    c.created_by,
    TRUE AS needs_naming
FROM public.campaigns c
WHERE c.organization_id IS NULL
  AND c.created_by IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.created_by = c.created_by
        AND o.brand_id = COALESCE(c.brand_id, 'wardsignup')
  );

-- 2. Owner membership rows for any orgs created above.
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
JOIN auth.users u ON u.id = o.created_by
WHERE NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = o.id
      AND m.user_id = o.created_by
      AND m.role = 'owner'
);

-- 3. Link gap-period campaigns to their owner's org.
UPDATE public.campaigns c
SET organization_id = o.id
FROM public.organizations o
WHERE c.organization_id IS NULL
  AND o.created_by = c.created_by
  AND o.brand_id = COALESCE(c.brand_id, 'wardsignup');
