import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { resolveEffectiveEventTimezone, sessionStartUtc } from "@/lib/event-timezone";
import { sendParticipantReminderEmail } from "@/lib/participant-email";
import type { ParticipantCampaignEmailFields } from "@/lib/participant-email";
import { publicSiteOriginAndBrandForCampaign } from "@/lib/brand";
import { claimCronRun, hourBucketDate } from "@/lib/rate-limit";
import { resolveCronBrandId } from "@/lib/cron-brand";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const WINDOW_START_H = 23;
const WINDOW_END_H = 25;
const MAX_PER_RUN = 300;

/**
 * ~24h before dated sessions only (sessions.session_date set). Recurring slots without a date are skipped.
 * Secured with Authorization: Bearer CRON_SECRET.
 * On Vercel Hobby, schedule hourly via an external ping (see organizer-faster) so the 23–25h window is reliable.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization")?.trim();
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Each deployment only processes its own brand's signups — the from-address
  // and Resend key are per-brand, so processing another brand's rows here would
  // pair that brand's from-domain with this deployment's key and be rejected.
  const brandId = resolveCronBrandId(request);

  // Idempotency: one run per hour bucket. The reminder window is 23–25h, so a
  // hourly external ping is the intended cadence; a replay within the same
  // hour would re-send to anyone whose row hasn't been marked yet.
  // Brand-scoped claim: all 3 deployments are pinged hourly against the same
  // shared Supabase; an unscoped key would let only the first arrival run.
  const claim = await claimCronRun(`participant-reminders:${brandId}`, hourBucketDate());
  if (!claim.claimed) {
    return NextResponse.json({ ok: true, brandId, skipped: "already_ran_this_hour" });
  }

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

  // Bound the candidate set by session_date in SQL. Rows that can never be
  // reminded (past sessions, recurring slots with no date) are skipped but
  // never marked, so without this filter they accumulate until they fill the
  // MAX_PER_RUN page and starve real upcoming reminders. The 23–25h window
  // means the session's local date is within ±2 days of today's UTC date for
  // any timezone; the per-row window check below stays authoritative.
  const dayMs = 24 * 60 * 60 * 1000;
  const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
  const minDate = isoDay(Date.now() - dayMs);
  const maxDate = isoDay(Date.now() + 2 * dayMs);

  const { data: rows, error } = await admin
    .from("signups")
    .select(
      `
      id,
      member_name,
      member_email,
      cancel_token,
      sessions!inner (
        session_date,
        time,
        end_time,
        day_of_week
      ),
      campaigns!inner (
        id,
        name,
        brand_id,
        public_host,
        event_timezone,
        event_end_date
      )
    `,
    )
    .is("reminder_sent_at", null)
    .not("member_email", "is", null)
    .eq("campaigns.brand_id", brandId)
    .gte("sessions.session_date", minDate)
    .lte("sessions.session_date", maxDate)
    .limit(MAX_PER_RUN);

  if (error) {
    console.error("participant-reminders query:", error);
    return NextResponse.json({ error: "Failed to list signups" }, { status: 500 });
  }

  const now = Date.now();
  const winStart = now + WINDOW_START_H * 60 * 60 * 1000;
  const winEnd = now + WINDOW_END_H * 60 * 60 * 1000;

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows || []) {
    const r = row as {
      id: string;
      member_name: string;
      member_email: string;
      cancel_token: string | null;
      sessions:
        | {
            session_date: string | null;
            time: string;
            end_time: string | null;
            day_of_week: number;
          }
        | null;
      campaigns: ParticipantCampaignEmailFields | null;
    };

    const session = Array.isArray(r.sessions) ? r.sessions[0] : r.sessions;
    const campaign = Array.isArray(r.campaigns) ? r.campaigns[0] : r.campaigns;
    const email = r.member_email?.trim();

    if (!session || !campaign || !email) {
      skipped += 1;
      continue;
    }

    if (!session.session_date) {
      skipped += 1;
      continue;
    }

    const tz = resolveEffectiveEventTimezone(campaign.event_timezone);
    let startUtc: Date;
    try {
      startUtc = sessionStartUtc(session.session_date, session.time, tz);
    } catch (e) {
      console.error("participant-reminders parse session start:", e);
      skipped += 1;
      continue;
    }

    const t = startUtc.getTime();
    if (!Number.isFinite(t)) {
      skipped += 1;
      continue;
    }

    if (t < winStart || t > winEnd) {
      skipped += 1;
      continue;
    }

    const { siteOrigin: reminderSiteOrigin } = publicSiteOriginAndBrandForCampaign(campaign as Parameters<typeof publicSiteOriginAndBrandForCampaign>[0]);
    const cancelUrl = r.cancel_token ? `${reminderSiteOrigin}/cancel/${r.cancel_token}` : undefined;
    const cancelToken = r.cancel_token ?? undefined;

    // Mark BEFORE sending (at-most-once). The old send-then-mark order meant a
    // failed mark re-emailed the same person every hour forever. A send
    // failure after marking drops one reminder — the safe direction for email.
    // The IS NULL filter makes the claim atomic against a concurrent run.
    const { data: claimed, error: upErr } = await admin
      .from("signups")
      .update({ reminder_sent_at: new Date().toISOString() } as never)
      .eq("id", r.id)
      .is("reminder_sent_at", null)
      .select("id");

    if (upErr) {
      errors.push(`${r.id}: ${upErr.message}`);
      continue;
    }
    if (!claimed?.length) {
      skipped += 1; // another run claimed it
      continue;
    }

    const sendResult = await sendParticipantReminderEmail({
      to: email,
      memberName: r.member_name,
      campaign,
      session: {
        day_of_week: session.day_of_week,
        time: session.time,
        end_time: session.end_time,
        session_date: session.session_date,
      },
      cancelUrl,
      cancelToken,
    });

    if (!sendResult.ok) {
      errors.push(`${r.id}: ${sendResult.error}`);
      continue;
    }

    sent += 1;
  }

  return NextResponse.json({
    ok: true,
    brandId,
    sent,
    skipped,
    errors: errors.length ? errors : undefined,
    windowHours: [WINDOW_START_H, WINDOW_END_H],
  });
}
