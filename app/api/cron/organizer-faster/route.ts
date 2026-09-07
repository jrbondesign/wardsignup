import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { sendOrganizerFasterAlertEmail } from "@/lib/organizer-email";
import { claimCronRun, hourBucketDate } from "@/lib/rate-limit";
import { resolveCronBrandId } from "@/lib/cron-brand";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Faster alerts batch job — call on a ~30 minute schedule (e.g. external cron or Vercel Pro Cron).
 * Vercel Hobby only allows one daily cron in vercel.json; schedule this endpoint elsewhere,
 * or register a 30-minute schedule in vercel.json on Pro.
 * Sends only when there are new signups since organizer_last_instant_notify_at.
 * Secured with Authorization: Bearer CRON_SECRET
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

  // Filter by brand_id so each brand's cron only processes its own campaigns.
  const brandId = resolveCronBrandId(request);

  // Idempotency: at most one run per hour bucket. External pings on a 30-min
  // schedule will succeed once per hour and short-circuit on the second hit,
  // which is fine for "did anything change in the last hour" alerts.
  // Brand-scoped claim: all 3 Vercel projects share one Supabase, so an
  // unscoped key would let one brand's ping starve the others for the hour.
  const claim = await claimCronRun(`organizer-faster:${brandId}`, hourBucketDate());
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

  const { data: campaigns, error } = await admin
    .from("campaigns")
    .select("id, organizer_instant_notify_enabled")
    .eq("organizer_instant_notify_enabled", true)
    .eq("brand_id", brandId);

  if (error) {
    console.error("organizer-faster cron list error:", error);
    return NextResponse.json(
      { error: "Failed to list campaigns" },
      { status: 500 },
    );
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of campaigns || []) {
    const c = row as { id: string };
    try {
      const result = await sendOrganizerFasterAlertEmail(admin, c.id);
      if (!result.ok) {
        if (result.skipped === "no_new_signups" || result.skipped === "disabled") {
          skipped += 1;
          continue;
        }
        if (result.skipped === "no_organizer_email") {
          skipped += 1;
          continue;
        }
        errors.push(`${c.id}: ${result.error || "send failed"}`);
        continue;
      }

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
  });
}
