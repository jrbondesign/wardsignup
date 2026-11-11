/**
 * Adds fix steps when the server email provider (Resend) rejects the API key.
 */
export function organizerReportResultMessage(data: { delivery?: unknown; sentTo?: unknown }): string {
  const to = typeof data.sentTo === "string" ? data.sentTo : "";
  if (data.delivery === "queued") {
    return to
      ? `Report queued for ${to}. It has not been sent yet.`
      : "Report queued. It has not been sent yet.";
  }
  if (data.delivery === "unconfirmed") {
    return "The report may already be on its way. Delivery was not confirmed.";
  }
  return to ? `Report sent to ${to}. Check inbox and spam.` : "Report sent! Check your inbox.";
}

export function organizerReportErrorHint(apiMessage: string): string {
  const m = (apiMessage || "").trim();
  if (m.includes("Vercel →")) return m;
  if (/api key|invalid.*key|missing_api_key|restricted_api_key/i.test(m)) {
    return `${m}

Fix: Vercel → this project → Settings → Environment Variables → set RESEND_API_KEY to a key from resend.com/api-keys (Production). Save, then Redeploy once.`;
  }
  return m;
}
