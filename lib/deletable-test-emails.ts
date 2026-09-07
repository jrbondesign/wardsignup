/**
 * Emails that may be deleted via POST /api/admin-utils/delete-test-users.
 * Override with env DELETABLE_TEST_USER_EMAILS (comma-separated).
 */
export function parseDeletableTestEmails(): string[] {
  const raw =
    process.env.DELETABLE_TEST_USER_EMAILS?.trim() ||
    [
      "bondesign+jasper@gmail.com",
      "jon+test@jrbond.com",
    ].join(",");
  return raw
    .split(/[,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
