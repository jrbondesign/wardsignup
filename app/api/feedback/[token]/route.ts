import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { consumeActionRate } from "@/lib/rate-limit";
import { getPostHogClient } from "@/lib/posthog-server";

export const dynamic = "force-dynamic";

const MAX_ANSWER_LENGTH = 2000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length > 128 || !/^[a-f0-9]+$/i.test(token)) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }

  const rate = await consumeActionRate("feedback_submit", request, 5);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  let body: {
    pmf?: unknown;
    retention?: unknown;
    value?: unknown;
    friction?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const PMF_VALUES = ["very", "somewhat", "not"] as const;
  const RETENTION_VALUES = ["definitely", "maybe", "no"] as const;
  const pmf =
    typeof body.pmf === "string" &&
    (PMF_VALUES as readonly string[]).includes(body.pmf)
      ? body.pmf
      : null;
  const retention =
    typeof body.retention === "string" &&
    (RETENTION_VALUES as readonly string[]).includes(body.retention)
      ? body.retention
      : null;
  const value =
    typeof body.value === "string" ? body.value.trim().slice(0, MAX_ANSWER_LENGTH) : "";
  const friction =
    typeof body.friction === "string" ? body.friction.trim().slice(0, MAX_ANSWER_LENGTH) : "";
  // Q1 (the PMF benchmark) is the one required answer — it's a single tap and
  // the metric the whole survey exists to track.
  if (!pmf) {
    return NextResponse.json(
      { error: "Please answer the first question." },
      { status: 400 },
    );
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Feedback is unavailable right now." },
      { status: 503 },
    );
  }
  const admin = createServiceRoleClient();

  // Only pending/sent rows accept a response — a second submit is a no-op 409.
  const { data: updated, error } = await admin
    .from("feedback_requests")
    .update({
      answer_pmf: pmf,
      answer_retention: retention,
      answer_value: value || null,
      answer_blocker: friction || null,
      responded_at: new Date().toISOString(),
      status: "responded",
    } as never)
    .eq("token", token)
    .in("status", ["pending", "sent"])
    .select("id, user_id, brand_id")
    .maybeSingle();

  if (error) {
    console.error("feedback submit update:", error);
    return NextResponse.json(
      { error: "Could not save your feedback." },
      { status: 500 },
    );
  }
  if (!updated) {
    // Token unknown, or already responded.
    const { data: existing } = await admin
      .from("feedback_requests")
      .select("id")
      .eq("token", token)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "Feedback was already submitted for this link." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }

  const row = updated as { user_id: string; brand_id: string };
  try {
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: row.user_id,
      event: "feedback_submitted",
      properties: {
        brand_id: row.brand_id,
        pmf,
        retention,
        answered_value: Boolean(value),
        answered_friction: Boolean(friction),
      },
    });
    await posthog.flush().catch(() => {});
  } catch (e) {
    console.error("feedback posthog capture:", e);
  }

  return NextResponse.json({ success: true });
}
