-- Org switcher gap: every org owner needs a matching `organization_members` row with
-- role='owner' and status='accepted', otherwise listUserOrganizations() returns nothing
-- for their owner-orgs and the dashboard hides the switcher (it shows only when count >= 2).
--
-- Two ways the row could go missing:
--   1. createOrganization() in lib/organizations.ts inserts the org and the member row in
--      two separate statements. If the second insert fails or the request is interrupted
--      between them, the org persists with no owner row.
--   2. Manual SQL fix-ups, prior data imports, or out-of-band inserts that didn't seed
--      the membership row.
--
-- Fix in two parts:
--   (a) One-shot backfill of any org whose owner_id has no accepted owner row.
--   (b) AFTER INSERT trigger on organizations to seed the row going forward, so
--       application code can stop doing it manually.

-- (a) Backfill: missing row entirely.
INSERT INTO public.organization_members
    (organization_id, user_id, invited_email, invited_by, role, status, accepted_at)
SELECT
    o.id,
    o.owner_id,
    COALESCE(u.email, ''),
    o.owner_id,
    'owner',
    'accepted',
    NOW()
FROM public.organizations o
JOIN auth.users u ON u.id = o.owner_id
WHERE NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = o.id
      AND m.user_id = o.owner_id
)
ON CONFLICT (organization_id, invited_email) DO NOTHING;

-- (a') Backfill: row exists for the owner but isn't an accepted owner row. Skip if some
-- other accepted owner already occupies the partial unique index slot — those need
-- manual review rather than a blind promotion.
UPDATE public.organization_members m
SET role = 'owner',
    status = 'accepted',
    accepted_at = COALESCE(m.accepted_at, NOW())
FROM public.organizations o
WHERE o.id = m.organization_id
  AND m.user_id = o.owner_id
  AND (m.role <> 'owner' OR m.status <> 'accepted')
  AND NOT EXISTS (
      SELECT 1 FROM public.organization_members m2
      WHERE m2.organization_id = o.id
        AND m2.role = 'owner'
        AND m2.status = 'accepted'
        AND m2.id <> m.id
  );

-- (b) Trigger: auto-seed owner membership on org insert. SECURITY DEFINER so the row
-- lands regardless of which role inserted the org. ON CONFLICT DO NOTHING keeps the
-- trigger compatible with any caller that still inserts the membership row itself.
CREATE OR REPLACE FUNCTION public.seed_owner_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT;
BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = NEW.owner_id;

    INSERT INTO public.organization_members
        (organization_id, user_id, invited_email, invited_by, role, status, accepted_at)
    VALUES
        (NEW.id, NEW.owner_id, COALESCE(v_email, ''), NEW.owner_id, 'owner', 'accepted', NOW())
    ON CONFLICT (organization_id, invited_email) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_owner_membership ON public.organizations;
CREATE TRIGGER trg_seed_owner_membership
    AFTER INSERT ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION public.seed_owner_membership();
