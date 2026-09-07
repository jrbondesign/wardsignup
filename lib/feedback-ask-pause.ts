/**
 * Temporary pause switch for creator feedback asks.
 *
 * Org Signup asks stay paused until explicitly enabled
 * (FEEDBACK_ASK_ENABLE_ORGSIGNUP=1) so fixing dead cron claims cannot flush a
 * catch-up ask blast. FEEDBACK_ASK_PAUSED_BRANDS can pause any brand.
 */
export function isFeedbackAskPaused(brandId: string): boolean {
  if (brandId === "orgsignup") {
    const allow = process.env.FEEDBACK_ASK_ENABLE_ORGSIGNUP?.trim().toLowerCase();
    if (allow !== "1" && allow !== "true") return true;
  }
  const raw = process.env.FEEDBACK_ASK_PAUSED_BRANDS?.trim();
  if (!raw) return false;
  const set = new Set(
    raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
  return set.has(brandId.toLowerCase());
}
