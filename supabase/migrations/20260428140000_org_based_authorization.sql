-- PR 3: cut over campaign authorization from created_by/user_email to organization
-- membership. PR 1+2 have already populated organization_id on every campaign row.

-- 1. Lock organization_id to NOT NULL now that backfill + auto-provisioning are in place.
ALTER TABLE public.campaigns
    ALTER COLUMN organization_id SET NOT NULL;

-- 2. Replace campaign policies. Delete remains owner-only; everything else is for any
--    accepted member of the campaign's organization.
DROP POLICY IF EXISTS "Users can read their own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can insert their own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can update their own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can delete their own campaigns" ON public.campaigns;

CREATE POLICY "Org members read campaigns"
    ON public.campaigns FOR SELECT
    USING (public.is_org_member(organization_id));

CREATE POLICY "Org members insert campaigns"
    ON public.campaigns FOR INSERT
    WITH CHECK (
        public.is_org_member(organization_id)
        AND created_by = auth.uid()
    );

CREATE POLICY "Org members update campaigns"
    ON public.campaigns FOR UPDATE
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

-- Delete: only the org owner may delete the campaign. Co-admins cannot.
CREATE POLICY "Org owner deletes campaign"
    ON public.campaigns FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.organizations o
            WHERE o.id = campaigns.organization_id
              AND o.created_by = auth.uid()
        )
    );

-- 3. Sessions: replace owner-by-creator policies with org-membership lookup.
DROP POLICY IF EXISTS "Campaign owners can insert sessions" ON public.sessions;
DROP POLICY IF EXISTS "Campaign owners can update sessions" ON public.sessions;
DROP POLICY IF EXISTS "Campaign owners can delete sessions" ON public.sessions;

CREATE POLICY "Org members insert sessions"
    ON public.sessions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = sessions.campaign_id
              AND public.is_org_member(c.organization_id)
        )
    );

CREATE POLICY "Org members update sessions"
    ON public.sessions FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = sessions.campaign_id
              AND public.is_org_member(c.organization_id)
        )
    );

CREATE POLICY "Org members delete sessions"
    ON public.sessions FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = sessions.campaign_id
              AND public.is_org_member(c.organization_id)
        )
    );

-- 4. Signups: read/insert remain public; mutate restricted to org members.
DROP POLICY IF EXISTS "Campaign owners can update signups" ON public.signups;
DROP POLICY IF EXISTS "Campaign owners can delete signups" ON public.signups;

CREATE POLICY "Org members update signups"
    ON public.signups FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = signups.campaign_id
              AND public.is_org_member(c.organization_id)
        )
    );

CREATE POLICY "Org members delete signups"
    ON public.signups FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = signups.campaign_id
              AND public.is_org_member(c.organization_id)
        )
    );

-- 5. Event invites: org members manage.
DROP POLICY IF EXISTS "Campaign owners can read their event invites" ON public.event_invites;
DROP POLICY IF EXISTS "Campaign owners can insert event invites" ON public.event_invites;
DROP POLICY IF EXISTS "Campaign owners can update event invites" ON public.event_invites;
DROP POLICY IF EXISTS "Campaign owners can delete event invites" ON public.event_invites;

CREATE POLICY "Org members read event invites"
    ON public.event_invites FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = event_invites.campaign_id
              AND public.is_org_member(c.organization_id)
        )
    );

CREATE POLICY "Org members insert event invites"
    ON public.event_invites FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = event_invites.campaign_id
              AND public.is_org_member(c.organization_id)
        )
    );

CREATE POLICY "Org members update event invites"
    ON public.event_invites FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = event_invites.campaign_id
              AND public.is_org_member(c.organization_id)
        )
    );

CREATE POLICY "Org members delete event invites"
    ON public.event_invites FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = event_invites.campaign_id
              AND public.is_org_member(c.organization_id)
        )
    );

-- 6. Campaign items: public read stays; mutate gated on org membership.
DROP POLICY IF EXISTS "Owner insert campaign_items" ON public.campaign_items;
DROP POLICY IF EXISTS "Owner update campaign_items" ON public.campaign_items;
DROP POLICY IF EXISTS "Owner delete campaign_items" ON public.campaign_items;

CREATE POLICY "Org members insert campaign_items"
    ON public.campaign_items FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = campaign_items.campaign_id
              AND public.is_org_member(c.organization_id)
        )
    );

CREATE POLICY "Org members update campaign_items"
    ON public.campaign_items FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = campaign_items.campaign_id
              AND public.is_org_member(c.organization_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = campaign_items.campaign_id
              AND public.is_org_member(c.organization_id)
        )
    );

CREATE POLICY "Org members delete campaign_items"
    ON public.campaign_items FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = campaign_items.campaign_id
              AND public.is_org_member(c.organization_id)
        )
    );

-- 7. Item signups: public read/insert stay; delete by org members.
DROP POLICY IF EXISTS "Owner delete item_signups" ON public.item_signups;

CREATE POLICY "Org members delete item_signups"
    ON public.item_signups FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = item_signups.campaign_id
              AND public.is_org_member(c.organization_id)
        )
    );
