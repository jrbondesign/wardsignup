import { captureServerException } from "@/lib/posthog-server";
import { NextResponse, after } from "next/server";
import { revalidateEventPage } from "@/lib/event-page-cache";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { createSignupIfCapacityRpc, mapSignupRpcError } from "@/lib/supabase";
import { getSignupRateLimitPerIpPerHour } from "@/lib/limits";
import { getClientIp } from "@/lib/request-ip";
import { verifyTurnstile, turnstileRejectionMessage } from "@/lib/turnstile";
import { sendParticipantSignupConfirmation } from "@/lib/participant-email";
import { sendLeaderSignupNotification, type LeaderCampaignEmailFields } from "@/lib/leader-email";
import { publicSiteOriginAndBrandForCampaign } from "@/lib/brand";
import { getPostHogClient } from "@/lib/posthog-server";
import { orgIdForCampaign } from "@/lib/analytics-context";
import { syncCampaignCalendar } from "@/lib/google-calendar-sync";
import { isGcalSyncFeatureEnabled } from "@/lib/gcal-feature";
import { SIGNUP_TIMEOUT_MESSAGE, SupabaseTimeoutError, withSupabaseTimeout } from "@/lib/supabase-timeout";
import {
  findReusableEmailSignup,
  memoryIdempotencyStore,
  parseSignupIdempotencyKey,
} from "@/lib/signup-idempotency";

export const maxDuration = 30;

function hashIp(ip: string): string {
  const salt = process.env.RATE_LIMIT_IP_SALT || "wardsignup_signup_rate";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      session_id, 
      campaign_id, 
      member_name, 
      member_email, 
      member_phone, 
      guest_names: rawGuests, 
      signup_note: rawNote,
      // Attribution tracking (optional, from client localStorage)
      first_touch_utm_source,
      first_touch_utm_medium,
      first_touch_utm_campaign,
      first_touch_ref,
    } = body;

    if (!session_id || !campaign_id || !member_name) {
      return NextResponse.json(
        { error: "Slot ID, event ID, and name are required" },
        { status: 400 }
      );
    }

    // Cloudflare Turnstile (no-op until both Turnstile keys are set). Checked
    // before the rate limit and before create_signup_if_capacity, so bots
    // neither take slots nor use up a shared network's signup allowance.
    // Siteverify outages fail open (see lib/turnstile.ts).
    const captcha = await verifyTurnstile(body.captchaToken, getClientIp(request));
    if (!captcha.ok) {
      return NextResponse.json(
        { error: turnstileRejectionMessage(captcha.reason), captcha: true },
        { status: 403 },
      );
    }

    // Sanitize guest names: must be an array of non-empty strings, max 10
    const sanitizedGuests: string[] = Array.isArray(rawGuests)
      ? rawGuests
          .map((n: unknown) => (typeof n === "string" ? n.trim() : ""))
          .filter(Boolean)
          .slice(0, 10)
      : [];

    // Guest names are already omitted by the event page when allow_guests is
    // off. Skipping the extra campaigns.allow_guests read avoids a stall-prone
    // query on submit (Nov 9 503s).
    const guest_names = sanitizedGuests;

    const idempotencyKey = parseSignupIdempotencyKey(body.idempotency_key);
    const isRetry = body.signup_retry === true;
    const store = memoryIdempotencyStore();
    const storeKey = idempotencyKey ? `signup:${idempotencyKey}` : null;
    if (storeKey) {
      const cached = await store.get(storeKey);
      if (cached && typeof cached === "object") {
        return NextResponse.json(cached);
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

      const { data: allowed, error: rateErr } = await withSupabaseTimeout(
        (signal) =>
          admin!.rpc(
            "try_consume_signup_rate",
            {
              p_ip_hash: ipHash,
              p_bucket: bucket.toISOString(),
              p_max: maxPerHour,
            } as never,
          ).abortSignal(signal),
        "try_consume_signup_rate",
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

    if (isRetry && admin) {
      const reused = await reuseEmailSignup(admin, session_id, campaign_id, member_email);
      if (reused) {
        const payload = { signup: reused, cancel_token: reused.cancel_token ?? null };
        if (storeKey) await store.set(storeKey, payload);
        return NextResponse.json(payload);
      }
    }

    const { data, error } = await withSupabaseTimeout(
      (signal) =>
        createSignupIfCapacityRpc({
          p_session_id: session_id,
          p_campaign_id: campaign_id,
          p_member_name: member_name.trim(),
          p_member_email: member_email ?? null,
          p_member_phone: member_phone ?? null,
          p_guest_names: guest_names,
        }, signal),
      "create_signup_if_capacity",
    );

    if (error) {
      const mapped = mapSignupRpcError(error);
      if (!mapped.known) console.error("Supabase signup RPC error:", error);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }

    if (!data) {
      return NextResponse.json(
        { error: "Failed to create signup" },
        { status: 500 }
      );
    }
    // The signup row exists now: expire the page cache right away so counts
    // update even if a later step throws. Expired again below for the note.
    revalidateEventPage(campaign_id);

    // Remember the result before note/email/analytics work so a later stall
    // still lets a same-isolate 503 retry return this row instead of inserting again.
    const cancelToken = (data as Record<string, unknown>).cancel_token as string | null | undefined;
    const payload = { signup: data, cancel_token: cancelToken ?? null };
    if (storeKey) await store.set(storeKey, payload);

    // Optional note + first-touch attribution in one non-critical update:
    // log failures but never fail the signup over them.
    const signupId = (data as Record<string, unknown>).id as string | undefined;
    const signupNote = typeof rawNote === "string" ? rawNote.trim() : "";
    if (admin && signupId) {
      const extraFields: Record<string, string> = {};
      if (signupNote) extraFields.signup_note = signupNote;
      if (first_touch_utm_source) extraFields.first_touch_utm_source = first_touch_utm_source;
      if (first_touch_utm_medium) extraFields.first_touch_utm_medium = first_touch_utm_medium;
      if (first_touch_utm_campaign) extraFields.first_touch_utm_campaign = first_touch_utm_campaign;
      if (first_touch_ref) extraFields.first_touch_ref = first_touch_ref;

      if (Object.keys(extraFields).length > 0) {
        const { error: extraError } = await admin
          .from("signups")
          .update(extraFields as never)
          .eq("id", signupId);
        if (extraError) {
          console.error("Signup note/attribution update failed:", extraError);
        }
      }
    }

    const emailTrim =
      typeof member_email === "string" ? member_email.trim() : "";
    if (admin) {
      // after() keeps the function alive past the response — a bare floating
      // promise can be frozen mid-send once the response is returned on Vercel.
      after(async () => {
        try {
          const { data: campaign, error: cErr } = await admin!
            .from("campaigns")
            .select("id, name, brand_id, public_host, event_timezone, event_end_date, event_type, leader_name, leader_email, user_email, organizer_instant_notify_enabled, leader_signup_email_enabled")
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
              operationId: signupId,
            });
            if (!r.ok && !r.queued) console.error("Participant confirmation send:", r.error);
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
          captureServerException(e, { route: "/api/signups" });
        }
      });

      // Sync to Google Calendar (fire-and-forget; never fails the signup)
      if (isGcalSyncFeatureEnabled()) {
        after(async () => {
          try {
            await syncCampaignCalendar(campaign_id);
          } catch (e) {
            console.error("Calendar sync after signup:", e);
            captureServerException(e, { route: "/api/signups" });
          }
        });
      }
    }

    const distinctId = request.headers.get("x-posthog-distinct-id") ?? `anon_signup_${crypto.randomUUID()}`;
    const posthog = getPostHogClient();
    const orgId = await orgIdForCampaign(admin, campaign_id);
    posthog.capture({
      distinctId,
      event: "signup_created",
      properties: {
        org_id: orgId,
        campaign_id,
        event_id: campaign_id,
        session_id,
        has_email: Boolean(member_email),
        has_phone: Boolean(member_phone),
      },
    });
    // Keep the function alive until the event is delivered.
    after(() => posthog.flush());

    revalidateEventPage(campaign_id);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof SupabaseTimeoutError) {
      console.error("Signup timed out:", error.message);
      captureServerException(error, {
        route: "/api/signups",
        properties: { kind: "supabase_timeout" },
      });
      return NextResponse.json({ error: SIGNUP_TIMEOUT_MESSAGE }, { status: 503 });
    }
    console.error("Error creating signup:", error);
    captureServerException(error, { route: "/api/signups" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function reuseEmailSignup(
  admin: ReturnType<typeof createClient>,
  sessionId: string,
  campaignId: string,
  memberEmail: unknown,
): Promise<(Record<string, unknown> & { cancel_token?: string | null }) | null> {
  // A timeout or lookup error must not fall through to another insert: the
  // first attempt may already have committed. The route catch returns 503.
  const { data } = await withSupabaseTimeout(
    (signal) =>
      admin
        .from("signups")
        .select("*")
        .eq("session_id", sessionId)
        .eq("campaign_id", campaignId)
        .gte("signed_up_at", new Date(Date.now() - 30 * 60_000).toISOString())
        .abortSignal(signal),
    "signups email dedupe",
  );
  const row = findReusableEmailSignup((data ?? []) as Array<{
    session_id: string;
    member_email?: string | null;
    signed_up_at: string;
    cancel_token?: string | null;
  }>, { sessionId, memberEmail });
  return row ? (row as unknown as Record<string, unknown> & { cancel_token?: string | null }) : null;
}
