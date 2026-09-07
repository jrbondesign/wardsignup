import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Campaign } from "@/lib/types";

/**
 * True if the user can administer this campaign — i.e. an accepted member of the
 * campaign's organization (owner or co-admin).
 *
 * Both admin and delete now use this same accepted-membership check.
 */
export async function userCanAdminCampaign(
  supabase: SupabaseClient,
  user: Pick<User, "id">,
  campaign: Pick<Campaign, "organization_id">,
): Promise<boolean> {
  if (!campaign.organization_id) return false;
  const { data, error } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", campaign.organization_id)
    .eq("user_id", user.id)
    .eq("status", "accepted")
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

/**
 * Any accepted member of the org (owner OR admin) may delete a campaign. Mirrors
 * the "Org members delete campaign" RLS policy (is_org_member) — admins are
 * trusted to manage the org's events, not just the single owner.
 */
export async function userCanDeleteCampaign(
  supabase: SupabaseClient,
  user: Pick<User, "id">,
  campaign: Pick<Campaign, "organization_id">,
): Promise<boolean> {
  return userCanAdminCampaign(supabase, user, campaign);
}
