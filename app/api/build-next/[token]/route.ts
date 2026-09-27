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

  const rate = await consumeActionRate("build_next_vote", request, 5);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  let body: {
    choice?: unknown;
    otherText?: unknown;
    additionalNotes?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const VOTE_VALUES = ["photos", "calendar_sync", "tithing_sheets", "something_else"] as const;
  const choice =
    typeof body.choice === "string" &&
    (VOTE_VALUES as readonly string[]).includes(body.choice)
      ? body.choice
      : null;
  const otherText =
    typeof body.otherText === "string" ? body.otherText.trim().slice(0, MAX_ANSWER_LENGTH) : "";
  const additionalNotes =
    typeof body.additionalNotes === "string" ? body.additionalNotes.trim().slice(0, MAX_ANSWER_LENGTH) : "";

  if (!choice) {
    return NextResponse.json(
      { error: "Please select an option." },
      { status: 400 },
    );
  }

  if (choice === "something_else" && !otherText) {
    return NextResponse.json(
      { error: "Please tell us what you'd like to see built." },
      { status: 400 },
    );
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Vote submission is unavailable right now." },
      { status: 503 },
    );
  }
  const admin = createServiceRoleClient();

  // Only rows without vote_submitted_at accept a vote — a second submit is a no-op 409.
  const { data: updated, error } = await admin
    .from("feedback_requests")
    .update({
      vote_choice: choice,
      vote_other_text: otherText || null,
      vote_additional_notes: additionalNotes || null,
      vote_submitted_at: new Date().toISOString(),
    } as never)
    .eq("token", token)
    .is("vote_submitted_at", null)
    .select("id, user_id, brand_id")
    .maybeSingle();

  if (error) {
    console.error("build-next vote update:", error);
    return NextResponse.json(
      { error: "Could not save your vote." },
      { status: 500 },
    );
  }
  if (!updated) {
    // Token unknown, or already voted.
    const { data: existing } = await admin
      .from("feedback_requests")
      .select("id")
      .eq("token", token)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "Vote was already submitted for this link." },
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
      event: "build_next_vote_submitted",
      properties: {
        brand_id: row.brand_id,
        vote_choice: choice,
        answered_other: Boolean(otherText),
        answered_notes: Boolean(additionalNotes),
      },
    });
    await posthog.flush().catch(() => {});
  } catch (e) {
    console.error("build-next posthog capture:", e);
  }

  return NextResponse.json({ success: true });
}
