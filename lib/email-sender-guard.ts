/**
 * Sender allowlist. Every email we send, on every provider (Resend, Brevo),
 * must come From an address at wardsignup.com. Anything else (a personal
 * Gmail sender left over in a provider dashboard, a typo in an env override)
 * is refused before it reaches a provider, and logged.
 *
 * Automated mail uses noreply@wardsignup.com (brand defaults in
 * lib/brand/brands.ts). jonathan@wardsignup.com is still allowed so internal
 * founder notices and already queued rows keep working.
 */

export const ALLOWED_SENDER_DOMAIN = "wardsignup.com";

/** Bare address check: exactly one "@", local part, and the domain wardsignup.com (no subdomains). */
const ALLOWED_ADDRESS = /^[^@\s<>"',;]+@wardsignup\.com$/i;

export function isAllowedSenderAddress(email: string | null | undefined): boolean {
  if (!email) return false;
  return ALLOWED_ADDRESS.test(email.trim());
}

/** "Ward Signup <noreply@x.com>" to { name, email }. */
export function parseFrom(from: string): { name: string | null; email: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim() };
  return { name: null, email: from.trim() };
}

export type SenderCheck =
  | { ok: true; name: string | null; email: string }
  | { ok: false; error: string };

/**
 * Check a full From header. Never throws. The error string names the domain
 * only, never the full address, so logs stay free of personal addresses.
 */
export function checkSender(from: string | null | undefined, kind?: string): SenderCheck {
  const parsed = parseFrom(from ?? "");
  if (isAllowedSenderAddress(parsed.email)) return { ok: true, name: parsed.name, email: parsed.email };
  const at = parsed.email.lastIndexOf("@");
  const domain = at >= 0 ? parsed.email.slice(at + 1).toLowerCase() || "(none)" : "(none)";
  const error = `Sender refused: From must be @${ALLOWED_SENDER_DOMAIN} (got domain ${domain})`;
  console.error(`[email-sender-guard] refused kind=${kind ?? "other"} domain=${domain}`);
  return { ok: false, error };
}

/**
 * Validate an env override that sets a From (e.g. WELCOME_EMAIL_FROM) or a
 * sender address (BREVO_SENDER_EMAIL). Returns the value when allowed, else
 * undefined (and logs) so the caller falls back to the safe brand default.
 */
export function allowedEnvSender(key: string, value: string | undefined): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (isAllowedSenderAddress(parseFrom(v).email)) return v;
  console.error(`[email-sender-guard] ignoring ${key}: not an @${ALLOWED_SENDER_DOMAIN} address`);
  return undefined;
}
