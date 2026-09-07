import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { suppressEmail } from "@/lib/email-send";
import { consumeActionRate } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Resend → email_suppressions for bounces and spam complaints.
 *
 * Fail-closed: if no webhook signing secret is configured, or signature
 * verification fails, we refuse the event (4xx) rather than suppress from an
 * unverified payload. Resend signs with Svix (svix-id / timestamp / signature);
 * verify against the raw body via resend.webhooks.verify.
 *
 * Configure one webhook per Resend project pointing at:
 *   https://<brand-host>/api/webhooks/resend
 * Events: email.bounced, email.complained
 * Secrets (any one may match — Ward / Ministry / Org projects):
 *   RESEND_WEBHOOK_SECRET
 *   RESEND_WEBHOOK_SECRET_MINISTRY
 *   RESEND_WEBHOOK_SECRET_ORG
 */

type ResendWebhookEvent = {
  type?: string;
  data?: {
    to?: string[] | string;
    email_id?: string;
    bounce?: { type?: string };
  };
};

function webhookSecrets(): string[] {
  return [
    process.env.RESEND_WEBHOOK_SECRET,
    process.env.RESEND_WEBHOOK_SECRET_MINISTRY,
    process.env.RESEND_WEBHOOK_SECRET_ORG,
  ]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
}

function recipientsFrom(data: ResendWebhookEvent["data"]): string[] {
  if (!data?.to) return [];
  const list = Array.isArray(data.to) ? data.to : [data.to];
  return list
    .map((e) => (typeof e === "string" ? e.trim().toLowerCase() : ""))
    .filter((e) => e.includes("@") && e.length <= 320);
}

function verifyWithAnySecret(
  payload: string,
  headers: { id: string; timestamp: string; signature: string },
  secrets: string[],
): ResendWebhookEvent {
  const resend = new Resend("re_webhook_verify_only");
  let lastErr: unknown;
  for (const webhookSecret of secrets) {
    try {
      return resend.webhooks.verify({
        payload,
        headers,
        webhookSecret,
      }) as ResendWebhookEvent;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("webhook verify failed");
}

export async function POST(request: NextRequest) {
  const rate = await consumeActionRate("resend-webhook", request, 120);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const secrets = webhookSecrets();
  if (secrets.length === 0) {
    // Fail closed: never act on unsigned webhook traffic.
    console.error("RESEND_WEBHOOK_SECRET* not configured — refusing webhook");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 503 },
    );
  }

  const id = request.headers.get("svix-id") ?? "";
  const timestamp = request.headers.get("svix-timestamp") ?? "";
  const signature = request.headers.get("svix-signature") ?? "";
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const payload = await request.text();
  let event: ResendWebhookEvent;
  try {
    event = verifyWithAnySecret(payload, { id, timestamp, signature }, secrets);
  } catch (e) {
    console.error("resend webhook signature invalid:", e);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const type = event.type ?? "";
  if (type !== "email.bounced" && type !== "email.complained") {
    // Acknowledge ignored event types so Resend does not retry.
    return NextResponse.json({ ok: true, ignored: type || "unknown" });
  }

  // Soft bounces should not permanently suppress; only hard/permanent-style.
  if (type === "email.bounced") {
    const bounceType = (event.data?.bounce?.type ?? "").toLowerCase();
    if (bounceType && bounceType !== "permanent" && bounceType !== "hard") {
      return NextResponse.json({
        ok: true,
        ignored: "non_permanent_bounce",
        bounceType,
      });
    }
  }

  const reason = type === "email.bounced" ? "bounce" : "complaint";
  const recipients = recipientsFrom(event.data);
  if (recipients.length === 0) {
    return NextResponse.json({ ok: true, suppressed: 0, warning: "no_recipients" });
  }

  const source = `resend:${type}:${event.data?.email_id ?? id}`;
  let suppressed = 0;
  const failed: string[] = [];
  for (const email of recipients) {
    const ok = await suppressEmail(email, reason, source);
    if (ok) suppressed += 1;
    else failed.push(email);
  }

  if (failed.length) {
    // Fail closed on persistence errors so Resend retries.
    console.error("resend webhook suppress failed:", failed);
    return NextResponse.json(
      { error: "suppress_failed", failed, suppressed },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, reason, suppressed });
}
