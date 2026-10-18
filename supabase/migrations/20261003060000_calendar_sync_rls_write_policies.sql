-- Add INSERT and UPDATE policies for campaign_calendar_sync
-- Allows org members to manage calendar sync settings for their campaigns

-- Allow org members to insert calendar sync settings for campaigns in their org
create policy "Org members can insert campaign calendar sync"
  on campaign_calendar_sync for insert
  with check (
    exists (
      select 1 from campaigns c
      where c.id = campaign_calendar_sync.campaign_id
        and public.is_org_member(c.organization_id)
    )
  );

-- Allow org members to update calendar sync settings for campaigns in their org
create policy "Org members can update campaign calendar sync"
  on campaign_calendar_sync for update
  using (
    exists (
      select 1 from campaigns c
      where c.id = campaign_calendar_sync.campaign_id
        and public.is_org_member(c.organization_id)
    )
  );
