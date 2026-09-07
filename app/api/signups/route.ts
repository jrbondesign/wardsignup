import { NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { createSignupIfCapacityRpc } from "@/lib/supabase";
import { getSignupRateLimitPerIpPerHour } from "@/lib/limits";
import { getClientIp } from "@/lib/request-ip";
import { sendParticipantSignupConfirmation } from "@/lib/participant-email";
import { sendLeaderSignupNotification, type LeaderCampaignEmailFields } from "@/lib/leader-email";
import { publicSiteOriginAndBrandForCampaign } from "@/lib/brand";
import { getPostHogClient } from "@/lib/posthog-server";

function hashIp(ip: string): string {
  const salt = process.env.RATE_LIMIT_IP_SALT || "wardsignup_signup_rate";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { session_id, campaign_id, member_name, member_email, member_phone, guest_names: rawGuests, signup_note: rawNote } = body;

    if (!session_id || !campaign_id || !member_name) {
      return NextResponse.json(
        { error: "Slot ID, event ID, and name are required" },
        { status: 400 }
      );
    }

    // Sanitize guest names: must be an array of non-empty strings, max 10
    const sanitizedGuests: string[] = Array.isArray(rawGuests)
      ? rawGuests
          .map((n: unknown) => (typeof n === "string" ? n.trim() : ""))
          .filter(Boolean)
          .slice(0, 10)
      : [];

    // Check whether this campaign allows guests before accepting them.
    // We fetch allow_guests alongside the campaign — a missing/null value defaults to true
    // so that existing events (pre-migration) are unaffected.
    let guest_names = sanitizedGuests;
    if (sanitizedGuests.length > 0) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (serviceKey && url) {
        const { createClient: sc } = await import("@supabase/supabase-js");
        const adminCheck = sc(url, serviceKey);
        const { data: campaignData } = await adminCheck
          .from("campaigns")
          .select("allow_guests")
          .eq("id", campaign_id)
          .single();
        const allowGuests = campaignData == null || (campaignData as { allow_guests?: boolean }).allow_guests !== false;
        if (!allowGuests) guest_names = [];
      }
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    let admin: ReturnType<typeof createClient> | null = null;
    if (serviceKey && url) {
      admin = createClient(url, serviceKey);
      const ip = getClientIp(request);
      const bucket = new Date();
      bucket.setMinutes(0, 0, 0);
      const ipHash = hashIp(ip);
      const maxPerHour = getSignupRateLimitPerIpPerHour();

      const { data: allowed, error: rateErr } = await admin.rpc(
        "try_consume_signup_rate",
        {
          p_ip_hash: ipHash,
          p_bucket: bucket.toISOString(),
          p_max: maxPerHour,
        } as never,
      );

      if (rateErr) {
        console.error("Signup rate limit RPC error:", rateErr);
      } else if (allowed === false) {
        return NextResponse.json(
          { error: "Too many signups from this network. Please try again later." },
          { status: 429 }
        );
      }
    }

    const { data, error } = await createSignupIfCapacityRpc({
      p_session_id: session_id,
      p_campaign_id: campaign_id,
      p_member_name: member_name.trim(),
      p_member_email: member_email ?? null,
      p_member_phone: member_phone ?? null,
      p_guest_names: guest_names,
    });

    if (error) {
      const msg =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message?: string }).message ?? "")
          : "";
      if (msg.includes("SESSION_FULL")) {
        return NextResponse.json(
          { error: "This slot is already full" },
          { status: 400 }
        );
      }
      if (msg.includes("SESSION_NOT_FOUND")) {
        return NextResponse.json({ error: "Slot not found" }, { status: 404 });
      }
      if (msg.includes("CAMPAIGN_MISMATCH")) {
        return NextResponse.json(
          { error: "Session does not belong to this event" },
          { status: 400 }
        );
      }
      console.error("Supabase signup RPC error:", error);
      return NextResponse.json(
        { error: "Failed to create signup" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Failed to create signup" },
        { status: 500 }
      );
    }

    // Persist the optional note (non-critical; don't fail the signup if this errors)
    const signupNote = typeof rawNote === "string" ? rawNote.trim() : "";
    if (signupNote && admin) {
      const signupId = (data as Record<string, unknown>).id as string | undefined;
      if (signupId) {
        await admin.from("signups").update({ signup_note: signupNote } as never).eq("id", signupId);
      }
    }

    const emailTrim =
      typeof member_email === "string" ? member_email.trim() : "";
    if (admin) {
      // Extract cancel_token from the newly created signup row
      const cancelToken = (data as Record<string, unknown>).cancel_token as string | null | undefined;
      // after() keeps the function alive past the response — a bare floating
      // promise can be frozen mid-send once the response is returned on Vercel.
      after(async () => {
        try {
          const { data: campaign, error: cErr } = await admin!
            .from("campaigns")
            .select("id, name, brand_id, public_host, event_timezone, event_end_date, leader_name, leader_email")
            .eq("id", campaign_id)
            .single();
          const { data: session, error: sErr } = await admin!
            .from("sessions")
            .select("day_of_week, time, end_time, session_date")
            .eq("id", session_id)
            .single();
          if (cErr || sErr || !campaign || !session) {
            if (cErr) console.error("Signup notification campaign fetch:", cErr);
            if (sErr) console.error("Signup notification session fetch:", sErr);
            return;
          }

          // Participant confirmation — only when they left an email address.
          if (emailTrim) {
            // Build the cancel URL — use public_host if set, otherwise fall back to brand's siteOrigin
            const { siteOrigin } = publicSiteOriginAndBrandForCampaign(campaign as Parameters<typeof publicSiteOriginAndBrandForCampaign>[0]);
            const cancelUrl = cancelToken ? `${siteOrigin}/cancel/${cancelToken}` : undefined;

            const r = await sendParticipantSignupConfirmation({
              to: emailTrim,
              memberName: member_name.trim(),
              campaign,
              session,
              cancelUrl,
              cancelToken: cancelToken ?? undefined,
              guestNames: guest_names.length > 0 ? guest_names : undefined,
            });
            if (!r.ok) console.error("Participant confirmation send:", r.error);
          }

          // Assigned-leader notification — fires on every signup when set.
          const leaderCampaign = campaign as unknown as LeaderCampaignEmailFields;
          if (leaderCampaign.leader_email) {
            const lr = await sendLeaderSignupNotification({
              campaign: leaderCampaign,
              sessions: [session as { day_of_week: number; time: string; end_time: string | null; session_date: string | null }],
              memberName: member_name.trim(),
              memberEmail: emailTrim || null,
              memberPhone: typeof member_phone === "string" ? member_phone : null,
              guestNames: guest_names.length > 0 ? guest_names : undefined,
              signupNote: signupNote || null,
            });
            if (!lr.ok) console.error("Leader notification send:", lr.error);
          }
        } catch (e) {
          console.error("Signup notification email:", e);
        }
      });
    }

    const distinctId = request.headers.get("x-posthog-distinct-id") ?? `anon_signup_${crypto.randomUUID()}`;
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId,
      event: "signup_created",
      properties: {
        campaign_id,
        session_id,
        has_email: Boolean(member_email),
        has_phone: Boolean(member_phone),
      },
    });

    const cancelToken = (data as Record<string, unknown>).cancel_token as string | null | undefined;
    return NextResponse.json({ signup: data, cancel_token: cancelToken ?? null });
  } catch (error) {
    console.error("Error creating signup:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
