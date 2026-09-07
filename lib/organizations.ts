import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Organization } from "@/lib/types";

export type CurrentOrg = Pick<Organization, "id" | "name" | "needs_naming" | "brand_id">;

export type UserOrgRole = "owner" | "admin";

export type UserOrgListItem = CurrentOrg & {
  role: UserOrgRole;
};

/**
 * Returns every org the user can access on this brand: orgs they own AND orgs where
 * they have an accepted membership row. Owner-orgs win when both apply.
 */
export async function listUserOrganizations(
  supabase: SupabaseClient,
  user: Pick<User, "id">,
  brandId: string,
): Promise<UserOrgListItem[]> {
  // RLS on organizations restricts SELECT to orgs the user is an accepted member of
  // (see is_org_member). Owners always have a seeded owner row — the
  // seed_owner_membership trigger inserts one on every org insert — so a single query
  // through organization_members covers both cases.
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organization:organization_id(id, name, needs_naming, brand_id, owner_id)")
    .eq("user_id", user.id)
    .eq("status", "accepted");

  if (error || !data) return [];

  type OrgRow = { id: string; name: string; needs_naming: boolean; brand_id: string; owner_id: string };
  const seen = new Set<string>();
  const out: UserOrgListItem[] = [];
  for (const row of data as unknown as Array<{ role: UserOrgRole; organization: OrgRow | OrgRow[] | null }>) {
    // Supabase types the embedded relation as an array even though it's 1:1 here.
    const o = Array.isArray(row.organization) ? row.organization[0] ?? null : row.organization;
    if (!o || o.brand_id !== brandId || seen.has(o.id)) continue;
    seen.add(o.id);
    // Trust the organizations.owner_id column as the source of truth for "owner" — a
    // membership row's role can be stale right after a transfer.
    const role: UserOrgRole = o.owner_id === user.id ? "owner" : "admin";
    out.push({ id: o.id, name: o.name, needs_naming: o.needs_naming, brand_id: o.brand_id, role });
  }

  // Stable ordering: owner orgs first, then alphabetical.
  out.sort((a, b) => {
    if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

/**
 * Returns the user's active organization for this brand, honoring their saved
 * selection from organizer_profiles. Falls back to the default-selection rule when
 * no selection is saved or the saved org is no longer accessible.
 */
export async function getCurrentOrganization(
  supabase: SupabaseClient,
  user: Pick<User, "id">,
  brandId: string,
): Promise<CurrentOrg | null> {
  const { data: profile } = await supabase
    .from("organizer_profiles")
    .select("selected_org_id")
    .eq("user_id", user.id)
    .eq("brand_id", brandId)
    .maybeSingle();

  const selectedId = (profile as { selected_org_id: string | null } | null)?.selected_org_id ?? null;

  if (selectedId) {
    const { data: selected } = await supabase
      .from("organizations")
      .select("id, name, needs_naming, brand_id")
      .eq("id", selectedId)
      .eq("brand_id", brandId)
      .maybeSingle();
    if (selected) return selected as CurrentOrg;
    // Stale selection (org deleted, brand mismatch, or user lost access) — fall through.
  }

  // Default: prefer an already-named org over a backfilled "Untitled" one. Restrict to
  // orgs the user owns to preserve historic single-user behavior; multi-org users get
  // routed to the chooser before they ever hit this fallback.
  const { data } = await supabase
    .from("organizations")
    .select("id, name, needs_naming, brand_id")
    .eq("brand_id", brandId)
    .eq("owner_id", user.id)
    .order("needs_naming", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as CurrentOrg | null) ?? null;
}

/**
 * Persist the user's chosen org for this brand. Caller must have already verified the
 * user belongs to the org; this function performs no membership check of its own
 * (RLS on organizer_profiles only gates the user_id, not the foreign org).
 */
export async function setSelectedOrganization(
  supabase: SupabaseClient,
  user: Pick<User, "id">,
  brandId: string,
  orgId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("organizer_profiles")
    .upsert(
      { user_id: user.id, brand_id: brandId, selected_org_id: orgId } as never,
      { onConflict: "user_id,brand_id" },
    );
  if (error) throw new Error(error.message);
}

/**
 * Creates a new organization. The seed_owner_membership trigger inserts the matching
 * accepted owner row in `organization_members`. Caller must validate name and brand.
 */
export async function createOrganization(
  supabase: SupabaseClient,
  user: Pick<User, "id">,
  brandId: string,
  name: string,
): Promise<CurrentOrg> {
  const { data, error } = await supabase
    .from("organizations")
    .insert({ brand_id: brandId, name, created_by: user.id, owner_id: user.id, needs_naming: false } as never)
    .select("id, name, needs_naming, brand_id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create organization");

  return data as CurrentOrg;
}
