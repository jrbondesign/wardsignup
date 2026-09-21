/**
 * Temporary pause switch for creator feedback asks.
 * Ward Signup: always enabled unless explicitly paused via FEEDBACK_ASK_PAUSED_BRANDS.
 */
export function isFeedbackAskPaused(brandId: string): boolean {
  const raw = process.env.FEEDBACK_ASK_PAUSED_BRANDS?.trim();
  if (!raw) return false;
  const set = new Set(
    raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
  return set.has(brandId.toLowerCase());
}
