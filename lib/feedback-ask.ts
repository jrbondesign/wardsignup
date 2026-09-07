import type { createServiceRoleClient } from "@/lib/supabase-admin";
import { publicSiteOriginAndBrandForCampaign } from "@/lib/brand";
import { claimCronRun, dayBucketDate } from "@/lib/rate-limit";
import { getPostHogClient } from "@/lib/posthog-server";
import {
  buildFeedbackDigestEmailHtml,
  sendFeedbackAskEmail,
  type FeedbackDigestRow,
} from "@/lib/feedback-email";
import { feedbackEmailFrom } from "@/lib/brand/email-from";
import { parseMetricsAdminEmails } from "@/lib/metrics-admin";
import { sendGuardedEmail } from "@/lib/email-send";
import { isFeedbackAskPaused } from "@/lib/feedback-ask-pause";

type Admin = ReturnType<typeof createServiceRoleClient>;

const creatorNotifyTo = process.env.CREATOR_NOTIFY_TO || "jon@jrbond.com";

function askDelayDays(): number {
  const n = Number(process.env.FEEDBACK_ASK_DELAY_DAYS);
  return Number.isFinite(n) && n >= 0 ? n : 4;
}

/**
 * Founder/internal/test inboxes that should never receive the feedback ask,
 * baked in so the skip doesn't depend on per-brand Vercel env being set.
 * Extend via CREATOR_NOTIFY_SKIP_EMAILS for anything environment-specific.
 */
const DEFAULT_SKIP_EMAILS = [
  "bondesign@gmail.com",
  "bondesign+test@gmail.com",
];

/** Founder/internal/test inboxes that should never receive the feedback ask. */
function feedbackSkipEmails(): Set<string> {
  const set = new Set<string>(parseMetricsAdminEmails());
  set.add(creatorNotifyTo.trim().toLowerCase());
  for (const e of DEFAULT_SKIP_EMAILS) set.add(e);
  const raw = process.env.CREATOR_NOTIFY_SKIP_EMAILS?.trim();
  if (raw) {
    for (const part of raw.split(",")) {
      const e = part.trim().toLowerCase();
      if (e) set.add(e);
    }
  }
  return set;
}

export type FeedbackAskSummary = {
  ran: boolean;
  sent: number;
  candidates?: number;
  inserted?: number;
  retried?: number;
  paused?: boolean;
  errors?: string[];
};

/**
 * Daily pass: find engaged creators (own a campaign with >=1 signup, created
 * at least FEEDBACK_ASK_DELAY_DAYS ago) who haven't been asked for feedback on
 * this brand yet, and send each a tokenized one-time feedback ask email.
 * Idempotent per UTC day via claimCronRun; once-per-user via the
 * (user_id, brand_id) unique constraint on feedback_requests.
 */
export async function runFeedbackAskPass(
  admin: Admin,
  brandId: string,
): Promise<FeedbackAskSummary> {
  if (isFeedbackAskPaused(brandId)) {
    return { ran: false, sent: 0, paused: true };
  }

  const claim = await claimCronRun(`feedback-ask:${brandId}`, dayBucketDate());
  if (!claim.claimed) return { ran: false, sent: 0 };

  const cutoff = new Date(
    Date.now() - askDelayDays() * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Inner join: only campaigns that have at least one signup.
  const { data: campaigns, error } = await admin
    .from("campaigns")
    .select("id, created_by, user_email, created_at, signups!inner(id)")
    .eq("brand_id", brandId)
    .not("created_by", "is", null)
    .lte("created_at", cutoff)
    .limit(500);

  if (error) {
    console.error("feedback-ask campaigns query:", error);
    return { ran: true, sent: 0, errors: [error.message] };
  }

  // One candidate per creator; keep a campaign row for email fallback.
  const byCreator = new Map<string, { created_by: string; user_email: string | null }>();
  for (const row of campaigns ?? []) {
    const c = row as unknown as {
      created_by: string;
      user_email: string | null;
    };
    if (!byCreator.has(c.created_by)) byCreator.set(c.created_by, c);
  }
  if (byCreator.size === 0) return { ran: true, sent: 0 };

  const skip = feedbackSkipEmails();
  const { siteOrigin, brand } = publicSiteOriginAndBrandForCampaign({
    brand_id: brandId,
  });

  // Existing rows for this brand: successful sends must never be re-asked;
  // pending/null sent_at rows are retryable (insert-then-fail victims).
  const { data: existingRows, error: existingErr } = await admin
    .from("feedback_requests")
    .select("id, user_id, email_lower, token, sent_at, status")
    .eq("brand_id", brandId)
    .limit(2000);
  if (existingErr) {
    console.error("feedback-ask existing rows:", existingErr);
    return { ran: true, sent: 0, errors: [existingErr.message] };
  }

  type Existing = {
    id: string;
    user_id: string;
    email_lower: string;
    token: string;
    sent_at: string | null;
    status: string;
  };
  const existingByUser = new Map<string, Existing>();
  for (const row of (existingRows ?? []) as Existing[]) {
    existingByUser.set(row.user_id, row);
  }

  const retryQueue: Existing[] = [];
  for (const row of existingByUser.values()) {
    if (row.sent_at == null && row.status === "pending") {
      retryQueue.push(row);
    }
  }

  const candidates: Array<{
    user_id: string;
    email: string;
    firstName: string | null;
  }> = [];
  for (const [userId, c] of byCreator) {
    if (candidates.length >= 40) break; // bound auth lookups per run
    if (existingByUser.has(userId)) continue; // already has a row (sent or pending)
    const { data: userData, error: userErr } =
      await admin.auth.admin.getUserById(userId);
    const authEmail = userData?.user?.email ?? null;
    if (userErr) console.error("feedback-ask getUserById:", userErr);
    const email = (authEmail || c.user_email || "").trim().toLowerCase();
    if (!email || skip.has(email)) continue;
    const meta = userData?.user?.user_metadata as
      | { full_name?: string; name?: string }
      | undefined;
    const firstName =
      meta?.full_name?.split(" ")[0] || meta?.name?.split(" ")[0] || null;
    candidates.push({ user_id: userId, email, firstName });
  }

  const maxSends = 20;
  let sent = 0;
  let inserted = 0;
  let retried = 0;
  const errors: string[] = [];
  const posthog = getPostHogClient();

  async function sendAndMark(row: {
    id: string;
    user_id: string;
    email_lower: string;
    token: string;
  }, firstName: string | null): Promise<boolean> {
    try {
      const result = await sendFeedbackAskEmail({
        brand,
        to: row.email_lower,
        firstName,
        formUrl: `${siteOrigin}/feedback/${row.token}`,
      });
      if (!result.ok) {
        errors.push(`${row.email_lower}: ${result.error}`);
        return false;
      }
      const { error: updErr } = await admin
        .from("feedback_requests")
        .update({ sent_at: new Date().toISOString(), status: "sent" } as never)
        .eq("id", row.id);
      if (updErr) {
        // Send succeeded but mark failed — leave pending so we do NOT insert a
        // duplicate; next run will retry. Prefer a possible duplicate ask over
        // a permanent skip only if the row vanished; here the row exists.
        errors.push(`${row.email_lower}: mark-sent failed: ${updErr.message}`);
      }
      posthog.capture({
        distinctId: row.user_id,
        event: "feedback_requested",
        properties: { brand_id: brandId },
      });
      return true;
    } catch (e) {
      errors.push(
        `${row.email_lower}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return false;
    }
  }

  // 1) Retry previously claimed-but-unsent rows (no new inserts).
  for (const row of retryQueue) {
    if (sent >= maxSends) break;
    if (skip.has(row.email_lower)) continue;
    const ok = await sendAndMark(row, null);
    if (ok) {
      sent += 1;
      retried += 1;
    }
  }

  // 2) New creators: insert one row only when we are about to send, then mark
  //    sent_at after success. A failed send leaves status=pending / sent_at=null
  //    so the next run retries instead of permanently skipping.
  for (const cand of candidates) {
    if (sent >= maxSends) break;
    const { data: insertedRows, error: insertErr } = await admin
      .from("feedback_requests")
      .upsert(
        [
          {
            user_id: cand.user_id,
            brand_id: brandId,
            email_lower: cand.email,
          },
        ] as never,
        { onConflict: "user_id,brand_id", ignoreDuplicates: true },
      )
      .select("id, user_id, email_lower, token, sent_at, status");

    if (insertErr) {
      errors.push(`${cand.email}: insert ${insertErr.message}`);
      continue;
    }

    let row = ((insertedRows ?? []) as Existing[])[0] ?? null;
    if (!row) {
      // Duplicate ignored — another run inserted concurrently; fetch it.
      const { data: fetched } = await admin
        .from("feedback_requests")
        .select("id, user_id, email_lower, token, sent_at, status")
        .eq("user_id", cand.user_id)
        .eq("brand_id", brandId)
        .maybeSingle();
      row = (fetched as Existing | null) ?? null;
    } else {
      inserted += 1;
    }
    if (!row) continue;
    if (row.sent_at) continue; // already successfully sent
    const ok = await sendAndMark(row, cand.firstName);
    if (ok) sent += 1;
  }

  await posthog.flush().catch(() => {});
  return {
    ran: true,
    sent,
    candidates: candidates.length + retryQueue.length,
    inserted,
    retried,
    errors: errors.length ? errors : undefined,
  };
}

export type FeedbackDigestSummary = {
  ran: boolean;
  responses: number;
  error?: string;
};

/**
 * Weekly pass (Mondays UTC): email the founder all new responses for this
 * brand, then mark them triaged so next week's digest only shows new ones.
 * A failed send leaves rows as 'responded' and retries next Monday.
 */
export async function runFeedbackDigestPass(
  admin: Admin,
  brandId: string,
): Promise<FeedbackDigestSummary> {
  if (new Date().getUTCDay() !== 1 && !process.env.FEEDBACK_DIGEST_FORCE) {
    return { ran: false, responses: 0 };
  }

  const claim = await claimCronRun(`feedback-digest:${brandId}`, dayBucketDate());
  if (!claim.claimed) return { ran: false, responses: 0 };

  const { data, error } = await admin
    .from("feedback_requests")
    .select(
      "id, email_lower, answer_pmf, answer_retention, answer_value, answer_blocker, responded_at",
    )
    .eq("brand_id", brandId)
    .eq("status", "responded")
    .order("responded_at", { ascending: true });

  if (error) {
    console.error("feedback-digest query:", error);
    return { ran: true, responses: 0, error: error.message };
  }
  const rows = (data ?? []) as Array<FeedbackDigestRow & { id: string }>;
  if (rows.length === 0) return { ran: true, responses: 0 };

  const { brand } = publicSiteOriginAndBrandForCampaign({ brand_id: brandId });

  // Founder-only internal mail: transactional category (no unsubscribe needed)
  // but still under the global ceiling.
  const send = await sendGuardedEmail({
    brand,
    category: "transactional",
    from: feedbackEmailFrom(brand),
    to: creatorNotifyTo,
    subject: `${brand.name}: ${rows.length} creator feedback response${rows.length === 1 ? "" : "s"} this week`,
    html: buildFeedbackDigestEmailHtml({ brand, responses: rows }),
  });
  if (!send.ok) {
    console.error("feedback-digest send error:", send.error || send.skipped);
    return { ran: true, responses: 0, error: send.error || send.skipped };
  }

  const { error: updateErr } = await admin
    .from("feedback_requests")
    .update({ status: "triaged" } as never)
    .in(
      "id",
      rows.map((r) => r.id),
    );
  if (updateErr) console.error("feedback-digest triage update:", updateErr);

  return { ran: true, responses: rows.length };
}
