import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAdminCampaign } from "@/lib/campaign-access";
import { revalidateEventPage } from "@/lib/event-page-cache";
import { isPublicEventUuid } from "@/lib/public-event-id";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import type { Campaign } from "@/lib/types";

/**
 * Expire the shared public event page cache for one event.
 *
 * The edit page saves slots (add, edit, reorder, delete) straight to Supabase
 * from the browser, so no server route sees those writes. It calls this right
 * after saving so the public page shows the change on the next load instead of
 * waiting out EVENT_PAGE_CACHE_SECONDS. Event admins only, so nobody else can
 * use it to force database reads.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isPublicEventUuid(id)) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const auth = await getAuthFromRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { supabase, user } = auth;

  const { data: event, error } = await createServiceRoleClient()
    .from("campaigns")
    .select("organization_id")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("event page revalidate lookup:", error);
    return NextResponse.json({ error: "Failed to look up event" }, { status: 500 });
  }
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (!(await userCanAdminCampaign(supabase, user, event as Pick<Campaign, "organization_id">))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  revalidateEventPage(id);
  return NextResponse.json({ ok: true });
}
