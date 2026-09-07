import { NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { createSignupIfCapacityRpc } from "@/lib/supabase";
import { getSignupRateLimitPerIpPerHour } from "@/lib/limits";
import { getClientIp } from "@/lib/request-ip";
import { sendParticipantBatchSignupConfirmation } from "@/lib/participant-email";
import { sendLeaderSignupNotification, type LeaderCampaignEmailFields } from "@/lib/leader-email";
import { publicSiteOriginAndBrandForCampaign } from "@/lib/brand";
import { getPostHogClient } from "@/lib/posthog-server";

function hashIp(ip: string): string {
  const salt = process.env.RATE_LIMIT_IP_SALT || "wardsignup_signup_rate";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

type SuccessResult = {
  session_id: string;
  signup_id: string;
  cancel_token: string | null;
};
type FailureResult = { session_id: string; error: string };
type SlotResult = SuccessResult | FailureResult;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      campaign_id,
      session_ids: rawSessionIds,
      member_name,
      member_email,
      member_phone,
      guest_names: rawGuests,
      signup_note: rawNote,
    } = body;

    if (!campaign_id || !member_name) {
      return NextResponse.json(
        { error: "Event ID and name are required" },
        { status: 400 },
      );
    }

    const sessionIds: string[] = Array.isArray(rawSessionIds)
      ? rawSessionIds.filter((s: unknown): s is string => typeof s === "string" && s.length > 0)
      : [];
    if (sessionIds.length === 0) {
      return NextResponse.json(
        { error: "At least one slot is required" },
        { status: 400 },
      );
    }
    if (sessionIds.length > 50) {
      return NextResponse.json(
        { error: "Too many slots in one request" },
        { status: 400 },
      );
    }

    const sanitizedGuests: string[] = Array.isArray(rawGuests)
      ? rawGuests
          .map((n: unknown) => (typeof n === "string" ? n.trim() : ""))
          .filter(Boolean)
          .slice(0, 10)
      : [];

    let guest_names = sanitizedGuests;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    let admin: ReturnType<typeof createClient> | null = null;

    if (serviceKey && url) {
      admin = createClient(url, serviceKey);

      // Honor allow_guests just like the single-signup route.
      if (sanitizedGuests.length > 0) {
        const { data: campaignData } = await admin
          .from("campaigns")
          .select("allow_guests")
          .eq("id", campaign_id)
          .single();
        const allowGuests = campaignData == null || (campaignData as { allow_guests?: boolean }).allow_guests !== false;
        if (!allowGuests) guest_names = [];
      }

      // One rate-limit consume per batch (not per slot).
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
        console.error("Bulk signup rate limit RPC error:", rateErr);
      } else if (allowed === false) {
        return NextResponse.json(
          { error: "Too many signups from this network. Please try again later." },
          { status: 429 },
        );
      }
    }

    const results: SlotResult[] = [];
    const successfulSessionIds: string[] = [];
    const successfulCancelTokens: string[] = [];
    const successfulSignupIds: string[] = [];

    // Sequential to surface per-slot capacity errors cleanly.
    for (const sessionId of sessionIds) {
      const { data, error } = await createSignupIfCapacityRpc({
        p_session_id: sessionId,
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
        let userMsg = "Failed to sign up for this slot";
        if (msg.includes("SESSION_FULL")) userMsg = "This slot is already full";
        else if (msg.includes("SESSION_NOT_FOUND")) userMsg = "Slot not found";
        else if (msg.includes("CAMPAIGN_MISMATCH")) userMsg = "Session does not belong to this event";
        else console.error("Bulk signup RPC error:", error);
        results.push({ session_id: sessionId, error: userMsg });
        continue;
      }

      if (!data) {
        results.push({ session_id: sessionId, error: "Failed to sign up for this slot" });
        continue;
      }

      const row = data as Record<string, unknown>;
      const signupId = row.id as string | undefined;
      const cancelToken = (row.cancel_token as string | null | undefined) ?? null;
      results.push({
        session_id: sessionId,
        signup_id: signupId ?? "",
        cancel_token: cancelToken,
      });
      successfulSessionIds.push(sessionId);
      if (cancelToken) successfulCancelTokens.push(cancelToken);
      if (signupId) successfulSignupIds.push(signupId);
    }

    // Persist the optional note on every successful signup (best-effort).
    const signupNote = typeof rawNote === "string" ? rawNote.trim() : "";
    if (signupNote && admin && successfulSignupIds.length > 0) {
      await admin
        .from("signups")
        .update({ signup_note: signupNote } as never)
        .in("id", successfulSignupIds);
    }

    // One combined confirmation email covering every slot (+ one leader
    // notification per batch when the campaign has an assigned leader).
    const emailTrim = typeof member_email === "string" ? member_email.trim() : "";
    if (admin && successfulSessionIds.length > 0) {
      // after() keeps the function alive past the response — a bare floating
      // promise can be frozen mid-send once the response is returned on Vercel.
      after(async () => {
        try {
          const { data: campaign, error: cErr } = await admin!
            .from("campaigns")
            .select("id, name, brand_id, public_host, event_timezone, event_end_date, leader_name, leader_email")
            .eq("id", campaign_id)
            .single();
          const { data: sessions, error: sErr } = await admin!
            .from("sessions")
            .select("id, day_of_week, time, end_time, session_date")
            .in("id", successfulSessionIds);
          if (cErr || sErr || !campaign || !sessions) {
            if (cErr) console.error("Bulk confirmation campaign fetch:", cErr);
            if (sErr) console.error("Bulk confirmation sessions fetch:", sErr);
            return;
          }

          // Preserve the order the user submitted slots in.
          const sessionsTyped = sessions as unknown as Array<{
            id: string;
            day_of_week: number;
            time: string;
            end_time: string | null;
            session_date: string | null;
          }>;
          const orderedSessions = successfulSessionIds
            .map((id) => sessionsTyped.find((s) => s.id === id))
            .filter((s): s is (typeof sessionsTyped)[number] => Boolean(s));

          if (emailTrim) {
            const { siteOrigin } = publicSiteOriginAndBrandForCampaign(
              campaign as Parameters<typeof publicSiteOriginAndBrandForCampaign>[0],
            );
            const primaryToken = successfulCancelTokens[0] ?? null;
            const cancelUrl = primaryToken ? `${siteOrigin}/cancel/${primaryToken}` : undefined;

            // Each signup row has its own cancel token; align them with the
            // sessions in the email so every slot gets a working cancel link
            // (a single token can only cancel the one row it belongs to).
            const tokenBySessionId = new Map(
              results
                .filter((res) => "cancel_token" in res && res.cancel_token)
                .map((res) => [res.session_id, (res as { cancel_token: string }).cancel_token]),
            );
            const sessionCancelUrls = orderedSessions.map((s) => {
              const t = tokenBySessionId.get(s.id);
              return t ? `${siteOrigin}/cancel/${t}` : null;
            });

            const r = await sendParticipantBatchSignupConfirmation({
              to: emailTrim,
              memberName: member_name.trim(),
              campaign,
              sessions: orderedSessions,
              cancelUrl,
              cancelToken: primaryToken ?? undefined,
              sessionCancelUrls,
              guestNames: guest_names.length > 0 ? guest_names : undefined,
            });
            if (!r.ok) console.error("Bulk confirmation send:", r.error);
          }

          const leaderCampaign = campaign as unknown as LeaderCampaignEmailFields;
          if (leaderCampaign.leader_email) {
            const lr = await sendLeaderSignupNotification({
              campaign: leaderCampaign,
              sessions: orderedSessions,
              memberName: member_name.trim(),
              memberEmail: emailTrim || null,
              memberPhone: typeof member_phone === "string" ? member_phone : null,
              guestNames: guest_names.length > 0 ? guest_names : undefined,
              signupNote: signupNote || null,
            });
            if (!lr.ok) console.error("Leader notification send:", lr.error);
          }
        } catch (e) {
          console.error("Bulk confirmation email:", e);
        }
      });
    }

    const distinctId = request.headers.get("x-posthog-distinct-id") ?? `anon_signup_${crypto.randomUUID()}`;
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId,
      event: "signup_batch_created",
      properties: {
        campaign_id,
        slot_count: sessionIds.length,
        success_count: successfulSessionIds.length,
        has_email: Boolean(member_email),
        has_phone: Boolean(member_phone),
      },
    });

    return NextResponse.json({
      results,
      primary_cancel_token: successfulCancelTokens[0] ?? null,
      success_count: successfulSessionIds.length,
    });
  } catch (error) {
    console.error("Error creating bulk signup:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
