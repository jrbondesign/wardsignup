/**
 * Creator calling (e.g. "Bishop", "Executive secretary").
 *
 * Stored as plain text on organizer_profiles.calling so a picked option and an
 * "Other" free text answer live in the same column. Calling is per person (two
 * leaders in one ward have different callings), so it sits on the creator's
 * profile, not on the organization. The org name already holds the ward name.
 *
 * The list covers wards, branches and stakes; nothing here assumes ward only.
 */

export const CALLING_MAX_LENGTH = 80;

/** Picklist values shown in the UI, in display order. "Other" is handled separately. */
export const CALLING_OPTIONS = [
  "Bishop",
  "Branch president",
  "Stake president",
  "Bishopric counselor",
  "Executive secretary",
  "Ward clerk",
  "Relief Society president",
  "Elders quorum president",
  "Young women president",
  "Primary president",
  "Sunday school president",
  "Ward mission leader",
  "Activities committee",
] as const;

export const CALLING_OTHER = "__other__";

/**
 * Normalize a calling for storage: trims, collapses whitespace, caps length.
 * Empty or non string input means "no calling" and returns null.
 */
export function normalizeCalling(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, CALLING_MAX_LENGTH);
}

/**
 * Split a stored calling into the picklist choice plus "Other" text, so the
 * form can show the right selection when editing later.
 */
export function splitCalling(stored: string | null | undefined): { choice: string; otherText: string } {
  const value = normalizeCalling(stored ?? "");
  if (!value) return { choice: "", otherText: "" };
  const match = CALLING_OPTIONS.find((o) => o.toLowerCase() === value.toLowerCase());
  if (match) return { choice: match, otherText: "" };
  return { choice: CALLING_OTHER, otherText: value };
}

/** Combine the form's picklist choice and "Other" text into the stored value. */
export function joinCalling(choice: string, otherText: string): string | null {
  if (!choice) return null;
  if (choice === CALLING_OTHER) return normalizeCalling(otherText);
  return normalizeCalling(choice);
}
