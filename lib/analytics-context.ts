/**
 * Ward-level ids for server-side PostHog events. Never throws: analytics
 * enrichment must not fail or slow a signup beyond one indexed lookup.
 */

type MinimalAdmin = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The campaign's organization (ward) id, or null when unknown or on any error. */
export async function orgIdForCampaign(
  admin: unknown,
  campaignId: string | null | undefined,
): Promise<string | null> {
  if (!admin || !campaignId) return null;
  try {
    const { data, error } = await (admin as MinimalAdmin)
      .from("campaigns")
      .select("organization_id")
      .eq("id", campaignId)
      .maybeSingle();
    if (error || !data) return null;
    const orgId = (data as { organization_id?: unknown }).organization_id;
    return typeof orgId === "string" && UUID_RE.test(orgId) ? orgId : null;
  } catch {
    return null;
  }
}
