/**
 * Adds fix steps when the server email provider (Resend) rejects the API key.
 */
export function organizerReportErrorHint(apiMessage: string): string {
  const m = (apiMessage || "").trim();
  if (m.includes("Vercel →")) return m;
  if (/api key|invalid.*key|missing_api_key|restricted_api_key/i.test(m)) {
    return `${m}

Fix: Vercel → this project → Settings → Environment Variables → set RESEND_API_KEY (and for Ministry, RESEND_API_KEY_MINISTRY) to keys from resend.com/api-keys (Production). Save, then Redeploy once.`;
  }
  return m;
}
