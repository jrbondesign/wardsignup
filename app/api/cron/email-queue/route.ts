import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { sendGuardedEmail } from "@/lib/email-send";
import { getBrandDefinition, toPublicBrand } from "@/lib/brand/brands";
import type { BrandId } from "@/lib/brand/types";
import type { QueuedEmailRow } from "@/lib/email-queue";
import { MAX_QUEUE_ATTEMPTS, REALTIME_KINDS, isRealtimeKind, realtimeRetrySendAfter } from "@/lib/email-queue-time";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_ATTEMPTS = MAX_QUEUE_ATTEMPTS;

function drainLimit(): number {
  const n = Number(process.env.EMAIL_QUEUE_DRAIN_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 150;
}

/**
 * Drains email_queue every hour at :07 (vercel.json "7 * * * *").
 *
 * - Near real time rows (welcome, new creator notice, feedback received;
 *   REALTIME_KINDS) are only here when Resend was out of budget and Brevo
 *   couldn't take them (not configured, or it failed). They are due at once
 *   and are sent first, through Brevo again if Resend is still full. A failed
 *   attempt backs off (next run, then about 2 hours); after 3 attempts the
 *   row is failed and never retried.
 * - Batch rows (digests, feedback asks) wait for 12:05 AM Arizona
 *   (lib/email-queue-time.ts), so the 12:07 AM run sends them.
 * Both daily counters in lib/email-deliver.ts (Arizona day budget, UTC day
 * safety cap) still apply; anything they refuse stays pending for a later run.
 * Each row is claimed (pending to sending) before it is sent, so overlapping
 * runs never send the same email twice. Rows go back to pending if Resend is
 * out of budget, and to failed after 3 errors.
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

  const nowIso = new Date().toISOString();
  const limit = drainLimit();
  // Near real time rows first, so a batch backlog can't use the budget ahead of a welcome.
  const realtimeRes = await admin
    .from("email_queue")
    .select("*")
    .eq("status", "pending")
    .in("kind", [...REALTIME_KINDS])
    .lte("send_after", nowIso)
    .order("send_after", { ascending: true })
    .limit(limit);
  const batchRes = realtimeRes.error
    ? realtimeRes
    : await admin
        .from("email_queue")
        .select("*")
        .eq("status", "pending")
        .not("kind", "in", `(${REALTIME_KINDS.join(",")})`)
        .lte("send_after", nowIso)
        .order("send_after", { ascending: true })
        .limit(limit);
  const error = realtimeRes.error || batchRes.error;
  if (error) {
    console.error("email-queue list error:", error);
    return NextResponse.json({ error: "Failed to list queue" }, { status: 500 });
  }
  const data = [...((realtimeRes.data ?? []) as QueuedEmailRow[]), ...((batchRes.data ?? []) as QueuedEmailRow[])].slice(0, limit);

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let stoppedOverBudget = false;

  for (const raw of data) {
    const { data: claimed } = await admin
      .from("email_queue")
      .update({ status: "sending", attempts: raw.attempts + 1 } as never)
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
      realtime: isRealtimeKind(raw.kind),
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
    const attemptsMade = raw.attempts + 1;
    const giveUp = attemptsMade >= MAX_ATTEMPTS;
    const patch: Record<string, unknown> = { status: giveUp ? "failed" : "pending", last_error: r.error ?? "send failed" };
    // Near real time rows back off: next run, then about 2 hours, then failed.
    if (!giveUp && isRealtimeKind(raw.kind)) {
      patch.send_after = realtimeRetrySendAfter(new Date(), attemptsMade).toISOString();
    }
    if (giveUp) console.error(`email_queue ${raw.id} (${raw.kind}) failed after ${attemptsMade} attempts: ${r.error ?? "send failed"}`);
    await admin.from("email_queue").update(patch as never).eq("id", raw.id);
    failed += 1;
  }

  return NextResponse.json({ ok: true, sent, failed, skipped, stoppedOverBudget });
}
