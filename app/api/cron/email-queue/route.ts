import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { sendGuardedEmail } from "@/lib/email-send";
import { getBrandDefinition, toPublicBrand } from "@/lib/brand/brands";
import type { BrandId } from "@/lib/brand/types";
import type { QueuedEmailRow } from "@/lib/email-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_ATTEMPTS = 3;

/**
 * A claim older than this is treated as abandoned (the run crashed or timed
 * out after claiming). Well above maxDuration so a live run is never touched.
 */
export const STALE_CLAIM_MS = 15 * 60 * 1000;

function drainLimit(): number {
  const n = Number(process.env.EMAIL_QUEUE_DRAIN_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 150;
}

/**
 * Drains email_queue just after the UTC quota reset (vercel.json: 00:07 UTC).
 * Each row is claimed (pending to sending) before it is sent, so overlapping
 * runs never send the same email twice. Rows go back to pending if Resend is
 * out of budget, and to failed after 3 errors.
 *
 * Recovery: a run that dies between claim and result write leaves the row in
 * sending. Each run first returns sending rows claimed more than
 * STALE_CLAIM_MS ago to pending (or failed once MAX_ATTEMPTS is used up).
 * This trades a possible duplicate (Resend accepted the email but the result
 * write was lost) for never silently dropping one; the attempts cap bounds
 * duplicates to at most MAX_ATTEMPTS sends.
 * Secured with Authorization: Bearer CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization")?.trim() !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Config error" }, { status: 500 });
  }

  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { data: requeued, error: requeueError } = await admin
    .from("email_queue")
    .update({ status: "pending", last_error: "claim expired" } as never)
    .eq("status", "sending")
    .lt("claimed_at", staleBefore)
    .lt("attempts", MAX_ATTEMPTS)
    .select("id");
  const { data: expired, error: expireError } = await admin
    .from("email_queue")
    .update({ status: "failed", last_error: "claim expired" } as never)
    .eq("status", "sending")
    .lt("claimed_at", staleBefore)
    .gte("attempts", MAX_ATTEMPTS)
    .select("id");
  if (requeueError || expireError) console.error("email-queue recovery error:", requeueError ?? expireError);
  const recovered = ((requeued as unknown[] | null) ?? []).length;
  const expiredClaims = ((expired as unknown[] | null) ?? []).length;

  const { data, error } = await admin
    .from("email_queue")
    .select("*")
    .eq("status", "pending")
    .lte("send_after", new Date().toISOString())
    .order("send_after", { ascending: true })
    .limit(drainLimit());
  if (error) {
    console.error("email-queue list error:", error);
    return NextResponse.json({ error: "Failed to list queue" }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let stoppedOverBudget = false;

  for (const raw of (data ?? []) as QueuedEmailRow[]) {
    const { data: claimed } = await admin
      .from("email_queue")
      .update({ status: "sending", attempts: raw.attempts + 1, claimed_at: new Date().toISOString() } as never)
      .eq("id", raw.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed || (claimed as unknown[]).length === 0) continue;

    const def = getBrandDefinition(raw.brand_id as BrandId);
    if (!def) {
      await admin.from("email_queue").update({ status: "failed", last_error: "unknown brand" } as never).eq("id", raw.id);
      failed += 1;
      continue;
    }

    const r = await sendGuardedEmail({
      brand: toPublicBrand(def),
      category: raw.category,
      kind: raw.kind,
      from: raw.from_address,
      to: raw.to_address,
      subject: raw.subject,
      html: raw.html,
      text: raw.text_body ?? undefined,
      replyTo: raw.reply_to ?? undefined,
      attachments: raw.attachments ?? undefined,
      fromQueue: true,
    });

    if (r.ok) {
      await admin
        .from("email_queue")
        .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null } as never)
        .eq("id", raw.id);
      sent += 1;
      continue;
    }
    if (r.skipped === "suppressed") {
      await admin.from("email_queue").update({ status: "skipped", last_error: "suppressed" } as never).eq("id", raw.id);
      skipped += 1;
      continue;
    }
    if (r.overBudget || r.skipped === "ceiling") {
      // Out of budget for now: put it back without using up an attempt.
      await admin
        .from("email_queue")
        .update({ status: "pending", attempts: raw.attempts, last_error: r.error ?? r.skipped ?? null } as never)
        .eq("id", raw.id);
      stoppedOverBudget = true;
      break;
    }
    const giveUp = raw.attempts + 1 >= MAX_ATTEMPTS;
    await admin
      .from("email_queue")
      .update({ status: giveUp ? "failed" : "pending", last_error: r.error ?? "send failed" } as never)
      .eq("id", raw.id);
    failed += 1;
  }

  return NextResponse.json({ ok: true, sent, failed, skipped, recovered, expired: expiredClaims, stoppedOverBudget });
}
