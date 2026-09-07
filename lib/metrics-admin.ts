/**
 * Emails allowed to access /api/metrics and /admin-utils.
 * Set METRICS_ADMIN_EMAILS (comma-separated) or METRICS_ADMIN_EMAIL in the server environment.
 */
export function parseMetricsAdminEmails(): string[] {
  const raw =
    process.env.METRICS_ADMIN_EMAILS ?? process.env.METRICS_ADMIN_EMAIL ?? "";
  if (raw.trim()) {
    return raw
      .split(/[,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }
  return ["bondesign@gmail.com"];
}

export function isMetricsAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return parseMetricsAdminEmails().includes(email.trim().toLowerCase());
}
