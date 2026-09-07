-- Allow org ADMINS (not just the owner) to delete events.
--
-- Previously only the org owner could delete a campaign ("Org owner deletes
-- campaign", USING owner_id = auth.uid()). Co-admins got a 403, which the UI
-- showed as a generic "Failed to delete event". Org admins are trusted to manage
-- the org's events, so deletion now uses the same accepted-membership check as
-- the other campaign policies (is_org_member), matching the app-side change in
-- lib/campaign-access.ts.
--
-- NOTE (multi-brand): all brands share Supabase wqmpllurnofdsfditrpo, so a single
-- `supabase db push` covers wardsignup + ministrysignup + orgsignup.

DROP POLICY IF EXISTS "Org owner deletes campaign" ON public.campaigns;

CREATE POLICY "Org members delete campaign"
  ON public.campaigns
  FOR DELETE
  USING (public.is_org_member(organization_id));
