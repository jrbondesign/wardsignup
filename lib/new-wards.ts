/**
 * New wards: a ward (organization) counts from its first published sheet, meaning the
 * earliest campaign in that org with at least one session (slot). Team / test sheets
 * are skipped.
 */

export type OrgWithAttribution = {
  id: string;
  first_touch_utm_source: string | null;
  first_touch_utm_medium: string | null;
  first_touch_utm_campaign: string | null;
  first_touch_ref: string | null;
  created_by: string;
  owner_id: string | null;
};

export type WardCampaign = { id: string; organization_id: string | null; created_at: string };

export function computeWardFirstEvents(opts: {
  orgs: OrgWithAttribution[];
  campaigns: WardCampaign[];
  /** Campaign ids that have at least one session. */
  campaignsWithSessions: Set<string>;
  teamSheets: Set<string>;
}): Map<string, { date: string; orgData: OrgWithAttribution }> {
  const orgById = new Map(opts.orgs.map((o) => [o.id, o]));
  const orgFirstEventMap = new Map<string, { date: string; orgData: OrgWithAttribution }>();
  for (const campaign of opts.campaigns) {
    if (!opts.campaignsWithSessions.has(campaign.id)) continue;
    const orgId = campaign.organization_id;
    if (!orgId) continue;

    const existing = orgFirstEventMap.get(orgId);
    if (!existing || campaign.created_at < existing.date) {
      const orgData = orgById.get(orgId);
      if (!orgData) continue;

      // Team ward: its current owner is a team or test account.
      if (opts.teamSheets.has(campaign.id)) continue;

      orgFirstEventMap.set(orgId, { date: campaign.created_at, orgData });
    }
  }
  return orgFirstEventMap;
}
