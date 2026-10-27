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
