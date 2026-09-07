import { NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { supabase } from "@/lib/supabase";
import { getPostHogClient } from "@/lib/posthog-server";
import { getClientIp } from "@/lib/request-ip";
import { getSignupRateLimitPerIpPerHour } from "@/lib/limits";
import { sendLeaderSignupNotification, type LeaderCampaignEmailFields } from "@/lib/leader-email";

function hashIp(ip: string): string {
  const salt = process.env.RATE_LIMIT_IP_SALT || "wardsignup_signup_rate";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** POST /api/item-signups — public signup for a campaign item */
export async function POST(request: Request) {
  try {
    // Rate limiting — same bucket as session signups to share quota across both types
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (serviceKey && supabaseUrl) {
      const admin = createClient(supabaseUrl, serviceKey);
      const ip = getClientIp(request);
      const bucket = new Date();
      bucket.setMinutes(0, 0, 0);
      const { data: allowed, error: rateErr } = await admin.rpc("try_consume_signup_rate", {
        p_ip_hash: hashIp(ip),
        p_bucket: bucket.toISOString(),
        p_max: getSignupRateLimitPerIpPerHour(),
      } as never);
      if (rateErr) {
        console.error("Item signup rate limit RPC error:", rateErr);
      } else if (allowed === false) {
        return NextResponse.json(
          { error: "Too many signups from this network. Please try again later." },
          { status: 429 }
        );
      }
    }

    const body = await request.json();
    const { item_id, campaign_id, member_name, member_email, signup_note } = body;
    const rawQuantity = body.quantity;
    const rawCustomLabel = typeof body.custom_label === "string" ? body.custom_label.trim() : "";

    if (!campaign_id) {
      return NextResponse.json({ error: "campaign_id is required" }, { status: 400 });
    }
    if (!item_id && !rawCustomLabel) {
      return NextResponse.json({ error: "item_id or custom_label is required" }, { status: 400 });
    }
    if (rawCustomLabel.length > 200) {
      return NextResponse.json({ error: "Custom item label is too long (max 200 chars)" }, { status: 400 });
    }
    if (!member_name || typeof member_name !== "string" || !member_name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    let quantity = 1;
    if (rawQuantity !== undefined && rawQuantity !== null && rawQuantity !== "") {
      const n = typeof rawQuantity === "number" ? rawQuantity : parseInt(String(rawQuantity), 10);
      if (!Number.isInteger(n) || n < 1) {
        return NextResponse.json({ error: "Quantity must be a positive whole number" }, { status: 400 });
      }
      quantity = n;
    }

    if (item_id) {
      // Verify item belongs to campaign and check limit (sum of claimed quantities, not row count)
      const { data: itemRaw, error: itemError } = await supabase
        .from("campaign_items")
        .select("id, campaign_id, item_limit, item_signups(id, quantity)")
        .eq("id", item_id)
        .eq("campaign_id", campaign_id)
        .single();

      if (itemError || !itemRaw) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }

      const item = itemRaw as unknown as {
        id: string;
        campaign_id: string;
        item_limit: number | null;
        item_signups: { id: string; quantity: number }[];
      };

      const claimedSum = Array.isArray(item.item_signups)
        ? item.item_signups.reduce((s, r) => s + (r.quantity ?? 1), 0)
        : 0;
      if (item.item_limit !== null && claimedSum + quantity > item.item_limit) {
        const remaining = Math.max(0, item.item_limit - claimedSum);
        return NextResponse.json(
          { error: remaining === 0 ? "This item is already full" : `Only ${remaining} left — please reduce the quantity` },
          { status: 409 }
        );
      }
    }

    const { data, error } = await supabase
      .from("item_signups")
      .insert({
        item_id: item_id || null,
        campaign_id,
        member_name: member_name.trim(),
        member_email: member_email?.trim() || null,
        signup_note: typeof signup_note === "string" && signup_note.trim() ? signup_note.trim() : null,
        quantity,
        custom_label: rawCustomLabel || null,
      } as never)
      .select()
      .single();

    if (error) {
      console.error("Failed to create item signup:", error);
      return NextResponse.json({ error: "Failed to sign up" }, { status: 500 });
    }

    // Assigned-leader notification (fire-and-forget; never fails the signup).
    if (serviceKey && supabaseUrl) {
      // after() keeps the function alive past the response — a bare floating
      // promise can be frozen mid-send once the response is returned on Vercel.
      after(async () => {
        try {
          const admin = createClient(supabaseUrl, serviceKey);
          const { data: campaign, error: cErr } = await admin
            .from("campaigns")
            .select("id, name, brand_id, public_host, event_timezone, event_end_date, leader_name, leader_email")
            .eq("id", campaign_id)
            .single();
          if (cErr || !campaign) {
            if (cErr) console.error("Item signup leader campaign fetch:", cErr);
            return;
          }
          const leaderCampaign = campaign as unknown as LeaderCampaignEmailFields;
          if (!leaderCampaign.leader_email) return;

          let itemLabel = rawCustomLabel || null;
          if (!itemLabel && item_id) {
            const { data: itemRow } = await admin
              .from("campaign_items")
              .select("label")
              .eq("id", item_id)
              .single();
            itemLabel = (itemRow as { label?: string } | null)?.label ?? null;
          }
          if (itemLabel && quantity > 1) itemLabel = `${itemLabel} × ${quantity}`;

          const lr = await sendLeaderSignupNotification({
            campaign: leaderCampaign,
            sessions: [],
            memberName: member_name.trim(),
            memberEmail: typeof member_email === "string" ? member_email.trim() || null : null,
            signupNote: typeof signup_note === "string" ? signup_note.trim() || null : null,
            itemLabel,
          });
          if (!lr.ok) console.error("Leader notification send:", lr.error);
        } catch (e) {
          console.error("Item signup leader notification:", e);
        }
      });
    }

    const distinctId = request.headers.get("x-posthog-distinct-id") ?? `anon_signup_${crypto.randomUUID()}`;
    const posthogClient = getPostHogClient();
    posthogClient.capture({
      distinctId,
      event: "item_signup_created",
      properties: {
        item_id,
        campaign_id,
        has_email: Boolean(member_email?.trim()),
      },
    });

    return NextResponse.json({ signup: data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
