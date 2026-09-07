import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { consumeActionRate } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Token is required." }, { status: 400 });
    }

    const rate = await consumeActionRate("signup_cancel", request, 30);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    }

    const admin = createServiceRoleClient();

    const { data: signup, error: fetchErr } = await admin
      .from("signups")
      .select("id, member_name, campaign_id")
      .eq("cancel_token", token)
      .maybeSingle();

    if (fetchErr) {
      console.error("signups/cancel fetch:", fetchErr);
      return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }

    if (!signup) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const { error: deleteErr } = await admin
      .from("signups")
      .delete()
      .eq("cancel_token", token);

    if (deleteErr) {
      console.error("signups/cancel delete:", deleteErr);
      return NextResponse.json({ error: "Failed to cancel signup." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("signups/cancel:", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
