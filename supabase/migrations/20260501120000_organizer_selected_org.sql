-- Per-(user, brand) selected organization. NULL means "fall back to default selection
-- logic". The app sets this when the user picks an org from the multi-org chooser, and
-- clears it when the user leaves an org or the org is deleted.

ALTER TABLE public.organizer_profiles
    ADD COLUMN IF NOT EXISTS selected_org_id UUID
        REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_organizer_profiles_selected_org
    ON public.organizer_profiles(selected_org_id) WHERE selected_org_id IS NOT NULL;
