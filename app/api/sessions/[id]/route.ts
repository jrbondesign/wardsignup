import { NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAdminCampaign } from "@/lib/campaign-access";

/** PATCH /api/sessions/[id] — update a session's time, capacity, location, or notes */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sessionId } = await params;
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    // Verify the session belongs to a campaign this user can administer
    const { data: session, error: fetchError } = await supabase
      .from("sessions")
      .select("id, campaign_id, campaigns(organization_id)")
      .eq("id", sessionId)
      .single();

    if (fetchError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const campaign = (session as { campaigns?: { organization_id?: string | null } }).campaigns;
    const canAdmin = await userCanAdminCampaign(supabase, user, {
      organization_id: campaign?.organization_id ?? null,
    });

    if (!canAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { time, end_time, capacity, location, notes, session_date } = body;

    const updates: Record<string, unknown> = {};
    if (time !== undefined) updates.time = time;
    if (end_time !== undefined) updates.end_time = end_time;
    if (capacity !== undefined) updates.capacity = Number(capacity);
    if (location !== undefined) updates.location = location;
    if (notes !== undefined) updates.notes = notes;
    if (session_date !== undefined) updates.session_date = session_date;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("sessions")
      .update(updates as never)
      .eq("id", sessionId)
      .select()
      .single();

    if (error) {
      console.error("PATCH /api/sessions/[id] error:", error);
      return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
    }

    return NextResponse.json({ session: data });
  } catch (err) {
    console.error("PATCH /api/sessions/[id] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** DELETE /api/sessions/[id] — delete a session if it has no signups */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sessionId } = await params;
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    // Verify ownership
    const { data: session, error: fetchError } = await supabase
      .from("sessions")
      .select("id, campaign_id, campaigns(created_by, user_email)")
      .eq("id", sessionId)
      .single();

    if (fetchError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const campaign = (session as { campaigns?: { created_by?: string; user_email?: string } }).campaigns;
    const ownedByUser =
      campaign?.created_by === user.id ||
      (user.email && campaign?.user_email === user.email);

    if (!ownedByUser) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Refuse if signups exist
    const { count: signupCount } = await supabase
      .from("signups")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);

    if ((signupCount ?? 0) > 0) {
      return NextResponse.json(
        { error: `Cannot delete a session that has ${signupCount} signup(s). Remove signups first.` },
        { status: 409 },
      );
    }

    const { error: deleteError } = await supabase
      .from("sessions")
      .delete()
      .eq("id", sessionId);

    if (deleteError) {
      console.error("DELETE /api/sessions/[id] error:", deleteError);
      return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/sessions/[id] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
