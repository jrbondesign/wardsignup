import type { PublicBrand } from "@/lib/brand/types";
import { feedbackEmailFrom } from "@/lib/brand/email-from";
import { escapeHtml } from "@/lib/html-escape";
import { sendGuardedEmail } from "@/lib/email-send";

/** Replies should reach a real inbox, same as the welcome email. */
const feedbackReplyTo =
  process.env.WELCOME_REPLY_TO?.trim() || "jonathan@wardsignup.com";

export type FeedbackSendResult =
  | { ok: true }
  | { ok: false; error: string };

export async function sendFeedbackAskEmail(params: {
  brand: PublicBrand;
  to: string;
  firstName: string | null;
  formUrl: string;
}): Promise<FeedbackSendResult> {
  const { brand, to, firstName, formUrl } = params;
  const first = firstName?.trim() || "there";
  const safeFirst = escapeHtml(first);
  const safeUrl = escapeHtml(formUrl);

  const text = `Hi ${first},

Thanks for trying ${brand.name} — I saw you created an event and people actually signed up. That's exactly what I built this for, so thank you.

A few quick questions (under a minute):

1. How would you feel if you could no longer use ${brand.name}?
2. Will you use it for your next event?
3. What's the single most valuable part of it for you?
4. What's the #1 thing holding it back from being perfect?

Answer here: ${formUrl}

Or just reply to this email — I read every message.

Thanks again,
Jonathan

${brand.name} · ${brand.siteUrl}
Made with ❤️ in Arizona`;

  const send = await sendGuardedEmail({
    brand,
    category: "notification",
    from: feedbackEmailFrom(brand),
    replyTo: feedbackReplyTo,
    to,
    subject: `Quick question about your ${brand.name} event`,
    text,
    html: `
      <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #0D2B35;">
        <p style="font-size: 16px; line-height: 1.7; margin: 0 0 16px;">Hi ${safeFirst},</p>
        <p style="font-size: 16px; line-height: 1.7; margin: 0 0 16px;">
          Thanks for trying ${escapeHtml(brand.name)} — I saw you created an event and people actually signed up.
          That's exactly what I built this for, so thank you.
        </p>
        <p style="font-size: 16px; line-height: 1.7; margin: 0 0 8px;">
          A few quick questions (under a minute):
        </p>
        <ol style="font-size: 16px; line-height: 1.7; margin: 0 0 16px; padding-left: 22px;">
          <li>How would you feel if you could no longer use ${escapeHtml(brand.name)}?</li>
          <li>Will you use it for your next event?</li>
          <li>What's the single most valuable part of it for you?</li>
          <li>What's the #1 thing holding it back from being perfect?</li>
        </ol>
        <p style="font-size: 16px; line-height: 1.7; margin: 0 0 16px;">
          <a href="${safeUrl}" style="color: #0E96B0;">Answer here</a> — or just reply to this email. I read every message.
        </p>
        <p style="font-size: 16px; line-height: 1.7; margin: 0 0 4px;">Thanks again,</p>
        <p style="font-size: 16px; line-height: 1.7; margin: 0 0 24px;">Jonathan</p>
        <div style="margin: 0; padding: 0; color: #5A8399;">
          <div style="margin: 0; padding: 0; font-size: 14px; line-height: 1.45;">
            ${escapeHtml(brand.name)} · <a href="${escapeHtml(brand.siteUrl)}" style="color: #0E96B0; text-decoration: none;">${escapeHtml(brand.siteHost)}</a>
          </div>
          <div style="margin: 0; padding: 0; font-size: 13px; line-height: 1.45;">
            Made with ❤️ in Arizona
          </div>
        </div>
      </div>
    `,
  });

  if (!send.ok) {
    return { ok: false, error: send.error || send.skipped || "send failed" };
  }
  return { ok: true };
}

export type FeedbackDigestRow = {
  email_lower: string;
  answer_pmf: string | null;
  answer_retention: string | null;
  answer_value: string | null;
  answer_blocker: string | null;
  responded_at: string | null;
};

const PMF_LABELS: Record<string, string> = {
  very: "Very disappointed",
  somewhat: "Somewhat disappointed",
  not: "Not disappointed",
};
const RETENTION_LABELS: Record<string, string> = {
  definitely: "Definitely",
  maybe: "Maybe",
  no: "No",
};

export function buildFeedbackDigestEmailHtml(params: {
  brand: PublicBrand;
  responses: FeedbackDigestRow[];
}): string {
  const { brand, responses } = params;

  // PMF benchmark rollup. NOTE: the 40% "very disappointed" bar only means
  // something at ~40+ responses — treat this as a trend line until then.
  const withPmf = responses.filter((r) => r.answer_pmf);
  const veryCount = responses.filter((r) => r.answer_pmf === "very").length;
  const pmfPct = withPmf.length
    ? Math.round((veryCount / withPmf.length) * 100)
    : 0;
  const summary = withPmf.length
    ? `PMF benchmark: <strong>${pmfPct}%</strong> "very disappointed" (${veryCount}/${withPmf.length} answered). ${
        withPmf.length < 40
          ? "Sample still small — directional only."
          : ""
      }`
    : "No PMF answers yet.";

  const rows = responses
    .map((r) => {
      const when = r.responded_at
        ? new Date(r.responded_at).toISOString().slice(0, 10)
        : "";
      const pmf = r.answer_pmf ? PMF_LABELS[r.answer_pmf] ?? r.answer_pmf : "—";
      const retention = r.answer_retention
        ? RETENTION_LABELS[r.answer_retention] ?? r.answer_retention
        : "—";
      return `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 13px; vertical-align: top; white-space: nowrap;">
            ${escapeHtml(r.email_lower)}<br /><span style="color: #6b7280;">${escapeHtml(when)}</span>
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 13px; vertical-align: top; white-space: nowrap;">
            ${escapeHtml(pmf)}<br /><span style="color: #6b7280;">next: ${escapeHtml(retention)}</span>
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 13px; vertical-align: top;">
            ${escapeHtml(r.answer_value?.trim() || "—")}
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 13px; vertical-align: top;">
            ${escapeHtml(r.answer_blocker?.trim() || "—")}
          </td>
        </tr>`;
    })
    .join("");

  return `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; max-width: 760px; margin: 0 auto; padding: 24px; color: #111827;">
      <h2 style="margin: 0 0 8px; font-size: 18px;">${escapeHtml(brand.name)} — creator feedback this week (${responses.length})</h2>
      <p style="margin: 0 0 16px; font-size: 14px; color: #374151;">${summary}</p>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="text-align: left; padding: 8px; border-bottom: 2px solid #d1d5db; font-size: 12px; text-transform: uppercase; color: #6b7280;">Creator</th>
            <th style="text-align: left; padding: 8px; border-bottom: 2px solid #d1d5db; font-size: 12px; text-transform: uppercase; color: #6b7280;">PMF / Next</th>
            <th style="text-align: left; padding: 8px; border-bottom: 2px solid #d1d5db; font-size: 12px; text-transform: uppercase; color: #6b7280;">Most valuable</th>
            <th style="text-align: left; padding: 8px; border-bottom: 2px solid #d1d5db; font-size: 12px; text-transform: uppercase; color: #6b7280;">Holding it back</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}
