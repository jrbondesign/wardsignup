import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ward/Unit name for an organization (organizations.ward_name).
 *
 * organizations.name holds the organization itself (Elders Quorum, Relief Society,
 * Bishopric, Primary). ward_name holds the ward, branch or stake it belongs to.
 * Optional; null means not set. Added by migration 20261025120000_organizer_calling.sql.
 */

export const WARD_NAME_MAX_LENGTH = 120;

/** Trim and collapse whitespace. Empty or non string input means "not set" (null). */
export function normalizeWardName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned : null;
}

/**
 * Read one org's Ward/Unit for display (dashboard ward line). Read only.
 * Returns null when not set, and undefined when it couldn't be read (column
 * missing, network, RLS) so the header shows neither a wrong ward nor a wrong
 * "Add your ward" prompt.
 */
export async function loadOrgWardName(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string | null | undefined> {
  try {
    const { data, error } = await supabase
      .from("organizations")
      .select("ward_name")
      .eq("id", orgId)
      .maybeSingle();
    if (error) return undefined;
    return normalizeWardName((data as { ward_name?: unknown } | null)?.ward_name);
  } catch {
    return undefined;
  }
}
