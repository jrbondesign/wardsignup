import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { sendOrganizerMetricsEmail } from "@/lib/organizer-email";
import { claimCronRun, dayBucketDate } from "@/lib/rate-limit";
import { runFeedbackAskPass, runFeedbackDigestPass } from "@/lib/feedback-ask";
import { resolveCronBrandId } from "@/lib/cron-brand";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function campaignNeedsDigest(
  admin: ReturnType<typeof createServiceRoleClient>,
  campaign: {
    id: string;
    organizer_last_digest_sent_at: string | null;
  },
): Promise<boolean> {
  const last = campaign.organizer_last_digest_sent_at;
  const id = campaign.id;

  if (!last) {
    // First digest after enabling: always send once so organizers aren't blocked
    // when there are sessions but zero signups yet (previously required count > 0).
    return true;
  }

  const { count: newSignups } = await admin
    .from("signups")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id)
    .gt("signed_up_at", last);

  if ((newSignups ?? 0) > 0) return true;

  const { data: touched } = await admin
    .from("sessions")
    .select("id")
    .eq("campaign_id", id)
    .gt("updated_at", last)
    .limit(1);

  return (touched?.length ?? 0) > 0;
}

/**
 * Vercel Cron / GH Actions pinger: daily digest for organizers who opted in,
 * plus independent creator feedback ask + Monday founder digest.
 * Secured with Authorization: Bearer CRON_SECRET.
 *
 * Feedback passes MUST run even when the organizer-digest day-claim is already
 * taken (or the digest path errors after claiming) — each feedback pass has its
 * own brand-scoped claimCronRun.
 */
export async function GET(request: NextRequest) {
  // Trim so accidental spaces in Vercel env don’t break Bearer matching (Vercel also rejects whitespace-only secrets at deploy).
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization")?.trim();
  // Driven by the hourly GitHub Actions pinger (see .github/workflows/
  // participant-reminders.yml), same as organizer-faster and
  // participant-reminders — those pings don't carry x-vercel-cron, so the
  // Bearer CRON_SECRET is the sole auth here. Replay is bounded by the
  // brand-scoped daily claimCronRun below (at most one real run per UTC day).
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Host wins on known brand domains so Org (www.orgsignup.com) claims
  // `*:orgsignup` even if NEXT_PUBLIC_BRAND_ID is missing/wrong on that project.
  const brandId = resolveCronBrandId(request);

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 500 },
    );
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Config error" },
      { status: 500 },
    );
  }

  // P0: feedback ask/digest run independently of the organizer-digest claim and
  // of digest early exits / list failures. Same UTC-day claim inside each pass.
  let feedbackAsk: Awaited<ReturnType<typeof runFeedbackAskPass>> | { error: string };
  try {
    feedbackAsk = await runFeedbackAskPass(admin, brandId);
  } catch (e) {
    console.error("feedback-ask pass:", e);
    feedbackAsk = { error: e instanceof Error ? e.message : String(e) };
  }
  let feedbackDigest: Awaited<ReturnType<typeof runFeedbackDigestPass>> | { error: string };
  try {
    feedbackDigest = await runFeedbackDigestPass(admin, brandId);
  } catch (e) {
    console.error("feedback-digest pass:", e);
    feedbackDigest = { error: e instanceof Error ? e.message : String(e) };
  }

  // Idempotency: at most one organizer-digest run per UTC day bucket.
  // Brand-scoped: all 3 Vercel projects share one Supabase.
  const claim = await claimCronRun(`organizer-digest:${brandId}`, dayBucketDate());
  if (!claim.claimed) {
    return NextResponse.json({
      ok: true,
      brandId,
      skipped: "already_ran_today",
      feedbackAsk,
      feedbackDigest,
    });
  }

  const { data: campaigns, error } = await admin
    .from("campaigns")
    .select("id, user_email, organizer_digest_enabled, organizer_last_digest_sent_at")
    .eq("organizer_digest_enabled", true)
    .eq("brand_id", brandId);

  if (error) {
    console.error("organizer-digest cron list error:", error);
    // Digest claim already taken for today, but feedback ran above.
    return NextResponse.json(
      {
        ok: false,
        brandId,
        error: "Failed to list campaigns",
        feedbackAsk,
        feedbackDigest,
      },
      { status: 500 },
    );
  }

  // Anti-spam guard 1: never digest a campaign whose event is entirely in the
  // past. Dates live on sessions (session_date; null = recurring weekly, which
  // counts as live). 2-day grace so a just-finished event still gets its final
  // summary.
  const ids = (campaigns ?? []).map((c) => (c as { id: string }).id);
  const liveCampaigns = new Set<string>();
  if (ids.length) {
    const grace = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const { data: sess } = await admin
      .from("sessions")
      .select("campaign_id, session_date")
      .in("campaign_id", ids);
    for (const s of (sess ?? []) as Array<{
      campaign_id: string;
      session_date: string | null;
    }>) {
      if (s.session_date === null || s.session_date >= grace) {
        liveCampaigns.add(s.campaign_id);
      }
    }
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];
  // Anti-spam guard 2: at most ONE digest email per organizer inbox per run.
  const emailedOrganizers = new Set<string>();

  for (const row of campaigns || []) {
    const c = row as {
      id: string;
      user_email: string | null;
      organizer_last_digest_sent_at: string | null;
    };
    const organizerEmail = (c.user_email ?? "").trim().toLowerCase();
    try {
      if (!liveCampaigns.has(c.id)) {
        skipped += 1;
        continue;
      }
      if (organizerEmail && emailedOrganizers.has(organizerEmail)) {
        skipped += 1;
        continue;
      }
      const needs = await campaignNeedsDigest(admin, c);
      if (!needs) {
        skipped += 1;
        continue;
      }

      const result = await sendOrganizerMetricsEmail(admin, c.id, "digest");
      if (!result.ok) {
        if (result.skipped === "no_organizer_email") {
          skipped += 1;
          continue;
        }
        errors.push(`${c.id}: ${result.error || "send failed"}`);
        continue;
      }

      await admin
        .from("campaigns")
        .update({ organizer_last_digest_sent_at: new Date().toISOString() } as never)
        .eq("id", c.id);

      if (organizerEmail) emailedOrganizers.add(organizerEmail);
      sent += 1;
    } catch (e: unknown) {
      errors.push(`${c.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    brandId,
    sent,
    skipped,
    errors: errors.length ? errors : undefined,
    feedbackAsk,
    feedbackDigest,
  });
}
