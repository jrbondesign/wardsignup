import { checkSender } from "@/lib/email-sender-guard";

/**
 * Senders the Brevo cutover may use for Ward Signup. Both are verified
 * senders in the Ward Signup Brevo account. Automated mail is From
 * noreply@ (lib/brand/brands.ts); the welcome email and the feedback ask are
 * From jonathan@ (welcomeEmailFrom / feedbackEmailFrom). The cutover keeps
 * each message's own From and never rewrites it to a different address.
 */
export const CUTOVER_SENDER_EMAILS = ["noreply@wardsignup.com", "jonathan@wardsignup.com"] as const;

const DEFAULT_NAMES: Record<string, string> = {
  "noreply@wardsignup.com": "Ward Signup",
  "jonathan@wardsignup.com": "Jonathan",
};

export function isCutoverSenderEmail(email: string | null | undefined): boolean {
  const e = email?.trim().toLowerCase() ?? "";
  return (CUTOVER_SENDER_EMAILS as readonly string[]).includes(e);
}

/**
 * Resolve the message's own From for a cutover send. Refuses (before any
 * provider is called) a brand other than wardsignup, a From that fails the
 * @wardsignup.com guard, or an @wardsignup.com address that is not one of the
 * verified Brevo senders above.
 */
export function cutoverSender(
  brandId: string,
  from: string | null | undefined,
  kind?: string,
):
  | { ok: true; from: string; email: string; name: string }
  | { ok: false; error: string } {
  if (brandId !== "wardsignup") {
    return { ok: false, error: "Brevo cutover From enforcement is only defined for wardsignup" };
  }
  const checked = checkSender(from, kind);
  if (!checked.ok) return { ok: false, error: checked.error };
  const email = checked.email.trim().toLowerCase();
  if (!isCutoverSenderEmail(email)) {
    return {
      ok: false,
      error: "Sender refused: the Brevo cutover only sends From noreply@wardsignup.com or jonathan@wardsignup.com",
    };
  }
  const name = (checked.name?.trim() || DEFAULT_NAMES[email]).replace(/[\r\n"<>]/g, "");
  return { ok: true, from: `${name} <${email}>`, email, name };
}
