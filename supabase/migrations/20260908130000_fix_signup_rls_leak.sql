-- SECURITY FIX: Close public read access to signups and item_signups.
-- Prior policy "Anyone can read signups" exposed all participant PII (names, emails, phones)
-- to unauthenticated users. Tighten to campaign-owner-only, matching the mutate policies.

-- 1. Signups: only org members of the campaign's org may read signups.
DROP POLICY IF EXISTS "Anyone can read signups" ON public.signups;

CREATE POLICY "Org members read signups"
    ON public.signups FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = signups.campaign_id
              AND public.is_org_member(c.organization_id)
        )
    );

-- 2. Item signups: same tightening.
DROP POLICY IF EXISTS "Public read item_signups" ON public.item_signups;

CREATE POLICY "Org members read item_signups"
    ON public.item_signups FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = item_signups.campaign_id
              AND public.is_org_member(c.organization_id)
        )
    );
