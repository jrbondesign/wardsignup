import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getMaxCampaignsForOrg,
  getMaxCampaignsPerUser,
  isUnlimitedEventsUser,
} from "@/lib/limits";

export type EventLimitResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Shared free-beta event-cap check used by both event creation and duplication.
 * The count is RLS-scoped to campaigns whose org the user is a member of, filtered
 * by brand. Per-org overrides (getMaxCampaignsForOrg) raise the cap for specific
 * orgs; unlimited users bypass the check entirely.
 */
export async function checkEventLimit(
  supabase: SupabaseClient,
  user: { email?: string | null },
  brandId: string,
  orgName: string | null | undefined,
): Promise<EventLimitResult> {
  if (isUnlimitedEventsUser(user.email)) return { ok: true };

  const maxCampaigns = getMaxCampaignsForOrg(orgName) ?? getMaxCampaignsPerUser();
  const { count, error } = await supabase
    .from("campaigns")
    .select("*", { count: "exact", head: true })
    .eq("brand_id", brandId);

  if (error) {
    console.error("Campaign count error:", error);
    return { ok: false, status: 500, error: "Failed to verify event limit" };
  }

  if ((count ?? 0) >= maxCampaigns) {
    return {
      ok: false,
      status: 403,
      error: `Free beta includes up to ${maxCampaigns} events per account. Delete an event to create another, or contact us.`,
    };
  }

  return { ok: true };
}
