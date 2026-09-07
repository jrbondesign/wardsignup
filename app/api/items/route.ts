import { NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAdminCampaign } from "@/lib/campaign-access";

/** Trim an optional section label to null-or-value, rejecting over-long input. */
function normalizeSection(raw: unknown, i: number): string | null {
  if (raw === undefined || raw === null) return null;
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if (s.length > 80) throw new Error(`Item ${i + 1} section is too long (max 80 chars)`);
  return s;
}

/** GET /api/items?campaign_id=xxx — list items with signup counts (owner auth required) */
export async function GET(request: Request) {
  try {
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    const { searchParams } = new URL(request.url);
    const campaign_id = searchParams.get("campaign_id");
    if (!campaign_id) {
      return NextResponse.json({ error: "campaign_id is required" }, { status: 400 });
    }

    // Verify ownership
    const { data: campaignRaw, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, organization_id")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaignRaw) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const campaign = campaignRaw as unknown as { id: string; organization_id: string | null };
    if (!(await userCanAdminCampaign(supabase, user, campaign))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: items, error } = await supabase
      .from("campaign_items")
      .select("*, item_signups(id, member_name, member_email)")
      .eq("campaign_id", campaign_id)
      .order("sort_order")
      .order("created_at")
      .limit(500);

    if (error) {
      console.error("Failed to fetch items:", error);
      return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
    }

    return NextResponse.json({ items: items || [] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** POST /api/items — create items for a campaign */
export async function POST(request: Request) {
  try {
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    const body = await request.json();
    const { campaign_id, items } = body;

    if (!campaign_id || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "campaign_id and a non-empty items array are required" },
        { status: 400 }
      );
    }

    if (items.length > 200) {
      return NextResponse.json({ error: "Maximum 200 items per event" }, { status: 400 });
    }

    // Verify ownership
    const { data: campaignRaw2, error: campaignError2 } = await supabase
      .from("campaigns")
      .select("id, organization_id")
      .eq("id", campaign_id)
      .single();

    if (campaignError2 || !campaignRaw2) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const campaign2 = campaignRaw2 as unknown as { id: string; organization_id: string | null };
    if (!(await userCanAdminCampaign(supabase, user, campaign2))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Validate each item
    const rows = items.map((item: { label: string; item_limit?: string | number | null; section?: string | null }, i: number) => {
      const label = typeof item.label === "string" ? item.label.trim() : "";
      if (!label) throw new Error(`Item ${i + 1} is missing a label`);

      let item_limit: number | null = null;
      if (item.item_limit !== undefined && item.item_limit !== null && item.item_limit !== "") {
        const n = Number(item.item_limit);
        if (!Number.isInteger(n) || n < 1) throw new Error(`Item ${i + 1} limit must be a positive whole number`);
        item_limit = n;
      }

      const section = normalizeSection(item.section, i);

      return { campaign_id: campaign2.id, label, item_limit, section, sort_order: i };
    });

    const { data, error } = await supabase
      .from("campaign_items")
      .insert(rows as never)
      .select();

    if (error) {
      console.error("Failed to create items:", error);
      return NextResponse.json({ error: "Failed to create items" }, { status: 500 });
    }

    return NextResponse.json({ items: data });
  } catch (err: any) {
    if (err?.message) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** PUT /api/items — update the full item list for a campaign (smart merge) */
export async function PUT(request: Request) {
  try {
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    const body = await request.json();
    const { campaign_id, items } = body;

    if (!campaign_id || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "campaign_id and a non-empty items array are required" },
        { status: 400 }
      );
    }

    if (items.length > 200) {
      return NextResponse.json({ error: "Maximum 200 items per event" }, { status: 400 });
    }

    // Verify ownership
    const { data: campaignRaw3, error: campaignError3 } = await supabase
      .from("campaigns")
      .select("id, organization_id")
      .eq("id", campaign_id)
      .single();

    if (campaignError3 || !campaignRaw3) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const campaign3 = campaignRaw3 as unknown as { id: string; organization_id: string | null };
    if (!(await userCanAdminCampaign(supabase, user, campaign3))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Validate submitted items
    const validated = items.map((item: { id?: string; label: string; item_limit?: string | number | null; section?: string | null }, i: number) => {
      const label = typeof item.label === "string" ? item.label.trim() : "";
      if (!label) throw new Error(`Item ${i + 1} is missing a label`);
      let item_limit: number | null = null;
      if (item.item_limit !== undefined && item.item_limit !== null && item.item_limit !== "") {
        const n = Number(item.item_limit);
        if (!Number.isInteger(n) || n < 1) throw new Error(`Item ${i + 1} limit must be a positive whole number`);
        item_limit = n;
      }
      const section = normalizeSection(item.section, i);
      return { id: typeof item.id === "string" ? item.id : undefined, label, item_limit, section, sort_order: i };
    });

    // Load existing items with signup counts to determine what can be deleted
    const { data: existingRaw } = await supabase
      .from("campaign_items")
      .select("id, item_signups(id)")
      .eq("campaign_id", campaign_id);

    const existing = (existingRaw || []) as unknown as { id: string; item_signups: { id: string }[] }[];
    const existingIdSet = new Set(existing.map((e) => e.id));
    const submittedIdSet = new Set(validated.filter((v) => v.id).map((v) => v.id as string));

    // Delete items that were removed AND have no signups
    const toDelete = existing
      .filter((e) => !submittedIdSet.has(e.id) && e.item_signups.length === 0)
      .map((e) => e.id);

    if (toDelete.length > 0) {
      await supabase.from("campaign_items").delete().in("id", toDelete);
    }

    // Update existing items
    const toUpdate = validated.filter((v) => v.id && existingIdSet.has(v.id));
    for (const row of toUpdate) {
      await supabase
        .from("campaign_items")
        .update({ label: row.label, item_limit: row.item_limit, section: row.section, sort_order: row.sort_order } as never)
        .eq("id", row.id as string);
    }

    // Insert new items
    const toInsert = validated.filter((v) => !v.id || !existingIdSet.has(v.id!));
    if (toInsert.length > 0) {
      const insertRows = toInsert.map(({ id: _id, ...rest }) => ({ ...rest, campaign_id }));
      await supabase.from("campaign_items").insert(insertRows as never);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err?.message) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
