import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth;
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Signup ID is required." }, { status: 400 });
  }

  // RLS "Campaign owners can delete signups" enforces that only the organizer
  // of the campaign this signup belongs to can delete it.
  const { error } = await supabase.from("signups").delete().eq("id", id);

  if (error) {
    console.error("admin/signups delete:", error);
    return NextResponse.json({ error: "Failed to remove signup." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
