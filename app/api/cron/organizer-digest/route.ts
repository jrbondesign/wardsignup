import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { sendOrganizerMetricsEmail } from "@/lib/organizer-email";
import { campaignNeedsDigest, leaderDigestRecipient } from "@/lib/digest-recipients";
import { claimCronRun } from "@/lib/rate-limit";
import { phoenixDayStartUtc } from "@/lib/phoenix-time";
import { runFeedbackAskPass } from "@/lib/feedback-ask";
import { resolveCronBrandId } from "@/lib/cron-brand";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Vercel Cron / GH Actions pinger: daily digest for organizers who opted in
 * and ALL assigned event leaders (regardless of organizer_digest_enabled),
 * plus independent creator feedback ask.
 * Secured with Authorization: Bearer CRON_SECRET.
 *
 * Schedule: vercel.json "5 12 * * *" = 12:05 UTC = 5:05 AM Phoenix, so
 * organizers have it in the morning. The once-per-day claim is the Arizona
 * day (resets at midnight Phoenix). 5:05 AM is inside the first 6 hours of
 * the Arizona day, so these deferrable digests send right away instead of
 * waiting in the email queue (lib/email-queue-time.ts).
 *
 * Feedback ask MUST run even when the organizer-digest day-claim is already
 * taken (or the digest path errors after claiming) — feedback ask has its
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
  // brand-scoped daily claimCronRun below (at most one real run per Arizona day).
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Host wins on known brand domains, so a wrong or missing
  // NEXT_PUBLIC_BRAND_ID can't change the brand-scoped claim key.
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

  // P0: feedback ask runs independently of the organizer-digest claim and
  // of digest early exits / list failures. Same Arizona day claim inside each pass.
  let feedbackAsk: Awaited<ReturnType<typeof runFeedbackAskPass>> | { error: string };
  try {
    feedbackAsk = await runFeedbackAskPass(admin, brandId);
  } catch (e) {
    console.error("feedback-ask pass:", e);
    feedbackAsk = { error: e instanceof Error ? e.message : String(e) };
  }

  // Idempotency: at most one organizer-digest run per Arizona day.
  // Brand-scoped: all 3 Vercel projects share one Supabase.
  const claim = await claimCronRun(`organizer-digest:${brandId}`, phoenixDayStartUtc());
  if (!claim.claimed) {
    return NextResponse.json({
      ok: true,
      brandId,
      skipped: "already_ran_today",
      feedbackAsk,
    });
  }

  // Select campaigns where EITHER the organizer opted in to digests OR there's an assigned leader.
  // Leaders receive digests regardless of organizer_digest_enabled (that flag only controls the organizer's own digest).
  const { data: campaigns, error } = await admin
    .from("campaigns")
    .select("id, user_email, organizer_digest_enabled, organizer_last_digest_sent_at, leader_email")
    .or("organizer_digest_enabled.eq.true,leader_email.not.is.null")
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
      organizer_digest_enabled: boolean | null;
      organizer_last_digest_sent_at: string | null;
      leader_email: string | null;
    };
    const organizerEmail = (c.user_email ?? "").trim().toLowerCase();
    try {
      if (!liveCampaigns.has(c.id)) {
        skipped += 1;
        continue;
      }
      const leaderTo = leaderDigestRecipient(c, organizerEmail);
      // Organizer gets digest only when they opted in AND haven't been emailed yet this run
      const organizerDue = Boolean(
        c.organizer_digest_enabled && 
        organizerEmail && 
        !emailedOrganizers.has(organizerEmail)
      );
      // Leader always gets digest (when present, not the organizer, and not emailed yet this run)
      const leaderDue = Boolean(leaderTo && !emailedOrganizers.has(leaderTo));
      if (!organizerDue && !leaderDue) {
        skipped += 1;
        continue;
      }
      // Nothing new since the last digest: no email for anyone on this event.
      const needs = await campaignNeedsDigest(admin, c);
      if (!needs) {
        skipped += 1;
        continue;
      }

      let delivered = false;
      if (organizerDue) {
        const result = await sendOrganizerMetricsEmail(admin, c.id, "digest");
        if (result.ok) {
          delivered = true;
          sent += 1;
          if (organizerEmail) emailedOrganizers.add(organizerEmail);
          if (result.sentTo) emailedOrganizers.add(result.sentTo.trim().toLowerCase());
        } else if (result.skipped === "no_organizer_email") {
          skipped += 1;
        } else {
          errors.push(`${c.id}: ${result.error || "send failed"}`);
        }
      }

      if (leaderTo && !emailedOrganizers.has(leaderTo)) {
        const lr = await sendOrganizerMetricsEmail(admin, c.id, "digest", { to: leaderTo });
        if (lr.ok) {
          delivered = true;
          sent += 1;
          emailedOrganizers.add(leaderTo);
        } else {
          errors.push(`${c.id} leader: ${lr.error || lr.skipped || "send failed"}`);
        }
      }

      if (delivered) {
        await admin
          .from("campaigns")
          .update({ organizer_last_digest_sent_at: new Date().toISOString() } as never)
          .eq("id", c.id);
      }
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
  });
}
