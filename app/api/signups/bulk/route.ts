import { captureServerException } from "@/lib/posthog-server";
import { NextResponse, after } from "next/server";
import { revalidateEventPage } from "@/lib/event-page-cache";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { createSignupIfCapacityRpc, mapSignupRpcError } from "@/lib/supabase";
import { getSignupRateLimitPerIpPerHour } from "@/lib/limits";
import { getClientIp } from "@/lib/request-ip";
import { verifyTurnstile, turnstileRejectionMessage } from "@/lib/turnstile";
import { sendParticipantBatchSignupConfirmation } from "@/lib/participant-email";
import { sendLeaderSignupNotification, type LeaderCampaignEmailFields } from "@/lib/leader-email";
import { publicSiteOriginAndBrandForCampaign } from "@/lib/brand";
import { getPostHogClient } from "@/lib/posthog-server";
import { analyticsContextForCampaign } from "@/lib/analytics-context";
import { syncCampaignCalendar } from "@/lib/google-calendar-sync";
import { isGcalSyncFeatureEnabled } from "@/lib/gcal-feature";
import { SIGNUP_TIMEOUT_MESSAGE, SupabaseTimeoutError, withSupabaseTimeout } from "@/lib/supabase-timeout";
import {
  findReusableEmailSignup,
  memoryIdempotencyStore,
  parseSignupIdempotencyKey,
} from "@/lib/signup-idempotency";

// Each Supabase call is capped at ~10s, so a healthy request finishes well
// inside this; a stalled database now fails fast instead of hanging to 300s.
export const maxDuration = 30;

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

    const sanitizedGuests: string[] = Array.isArray(rawGuests)
      ? rawGuests
          .map((n: unknown) => (typeof n === "string" ? n.trim() : ""))
          .filter(Boolean)
          .slice(0, 10)
      : [];

    // Guest names are already omitted by the event page when allow_guests is
    // off. Skipping the extra campaigns.allow_guests read avoids a stall-prone
    // query on submit (Nov 9 503s). A crafted request can still send guests.
    const guest_names = sanitizedGuests;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    let admin: ReturnType<typeof createClient> | null = null;

    const idempotencyKey = parseSignupIdempotencyKey(body.idempotency_key);
    const isRetry = body.signup_retry === true;
    const store = memoryIdempotencyStore();
    const storeKey = idempotencyKey ? `bulk:${idempotencyKey}` : null;
    if (storeKey) {
      const cached = await store.get(storeKey);
      if (cached && typeof cached === "object") {
        return NextResponse.json(cached);
      }
    }

    if (serviceKey && url) {
      admin = createClient(url, serviceKey);

      // One rate-limit consume per batch (not per slot).
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
      if (storeKey) {
        const cachedSlot = await store.get(`${storeKey}:${sessionId}`);
        if (
          cachedSlot &&
          typeof cachedSlot === "object" &&
          typeof (cachedSlot as { signup_id?: unknown }).signup_id === "string" &&
          (cachedSlot as { signup_id: string }).signup_id
        ) {
          const reused = cachedSlot as ReusedSlot;
          results.push(reused);
          successfulSessionIds.push(sessionId);
          if (reused.cancel_token) successfulCancelTokens.push(reused.cancel_token);
          successfulSignupIds.push(reused.signup_id);
          continue;
        }
      }

      if (isRetry && admin && normalizeEmail(member_email)) {
        const reused = await reuseEmailSignup(admin, sessionId, campaign_id, member_email);
        if (reused) {
          results.push(reused);
          successfulSessionIds.push(sessionId);
          if (reused.cancel_token) successfulCancelTokens.push(reused.cancel_token);
          successfulSignupIds.push(reused.signup_id);
          continue;
        }
      }

      const { data, error } = await withSupabaseTimeout(
        (signal) =>
          createSignupIfCapacityRpc({
            p_session_id: sessionId,
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
        if (!mapped.known) console.error("Bulk signup RPC error:", error);
        const userMsg = mapped.known ? mapped.message : "Failed to sign up for this slot";
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
      if (storeKey && signupId) {
        await store.set(`${storeKey}:${sessionId}`, {
          session_id: sessionId,
          signup_id: signupId,
          cancel_token: cancelToken,
        });
      }
    }

    // Rows exist now: expire the page cache right away so counts update even
    // if the note save below throws. Expired again at the end for the note.
    if (successfulSignupIds.length > 0) revalidateEventPage(campaign_id);

    // Persist the optional note on every successful signup (best-effort).
    const signupNote = typeof rawNote === "string" ? rawNote.trim() : "";
    if (signupNote && admin && successfulSignupIds.length > 0) {
      // The signups already exist, so a slow note save is logged rather than
      // reported as a failed signup.
      try {
        await withSupabaseTimeout(
          (signal) =>
            admin
              .from("signups")
              .update({ signup_note: signupNote } as never)
              .in("id", successfulSignupIds)
              .abortSignal(signal),
          "signups note update",
        );
      } catch (e) {
        if (!(e instanceof SupabaseTimeoutError)) throw e;
        console.error("Bulk signup note save:", e);
      }
    }

    // One combined confirmation email covering every slot (+ one leader
    // notification per batch when the campaign has an assigned leader).
    const emailTrim = typeof member_email === "string" ? member_email.trim() : "";
    if (admin && successfulSessionIds.length > 0) {
      // after() keeps the function alive past the response — a bare floating
      // promise can be frozen mid-send once the response is returned on Vercel.
      after(async () => {
        try {
          const { data: campaign, error: cErr } = await withSupabaseTimeout(
            (signal) =>
              admin!
                .from("campaigns")
                .select("id, name, brand_id, public_host, event_timezone, event_end_date, event_type, leader_name, leader_email, user_email, organizer_instant_notify_enabled, leader_signup_email_enabled")
                .eq("id", campaign_id)
                .abortSignal(signal)
                .single(),
            "campaigns confirmation fetch",
          );
          const { data: sessions, error: sErr } = await withSupabaseTimeout(
            (signal) =>
              admin!
                .from("sessions")
                .select("id, day_of_week, time, end_time, session_date")
                .in("id", successfulSessionIds)
                .abortSignal(signal),
            "sessions confirmation fetch",
          );
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

            const operationId = results
              .filter((res): res is SuccessResult => "signup_id" in res && Boolean(res.signup_id))
              .map((res) => res.signup_id)
              .sort()
              .join(",");
            const r = await sendParticipantBatchSignupConfirmation({
              to: emailTrim,
              memberName: member_name.trim(),
              campaign,
              sessions: orderedSessions,
              cancelUrl,
              cancelToken: primaryToken ?? undefined,
              operationId: operationId || undefined,
              sessionCancelUrls,
              guestNames: guest_names.length > 0 ? guest_names : undefined,
            });
            if (!r.ok && !r.queued) console.error("Bulk confirmation send:", r.error);
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
          captureServerException(e, { route: "/api/signups/bulk" });
        }
      });

      // Sync to Google Calendar (fire-and-forget; never fails the signup)
      if (isGcalSyncFeatureEnabled()) {
        after(async () => {
          try {
            await syncCampaignCalendar(campaign_id);
          } catch (e) {
            console.error("Calendar sync after bulk signup:", e);
            captureServerException(e, { route: "/api/signups/bulk" });
          }
        });
      }
    }

    const distinctId = request.headers.get("x-posthog-distinct-id") ?? `anon_signup_${crypto.randomUUID()}`;
    const slotCount = sessionIds.length;
    const successCount = successfulSessionIds.length;
    // The ward lookup and the capture run after the response is sent; after()
    // keeps the function alive so the event isn't dropped when it freezes.
    after(async () => {
      try {
        const { orgId, isTestOrg } = await withSupabaseTimeout(
          analyticsContextForCampaign(admin, campaign_id),
          "campaigns analytics context",
        ).catch(() => ({ orgId: null, isTestOrg: null }));
        const posthog = getPostHogClient();
        posthog.capture({
          distinctId,
          event: "signup_batch_created",
          properties: {
            org_id: orgId,
            is_test_org: isTestOrg,
            campaign_id,
            event_id: campaign_id,
            slot_count: slotCount,
            success_count: successCount,
            has_email: Boolean(member_email),
            has_phone: Boolean(member_phone),
          },
        });
        await posthog.flush();
      } catch (e) {
        console.error("signup_batch_created capture:", e);
      }
    });

    // Notes (if any) are on the rows now; expire again. Skip when nothing landed
    // so a failed-only attempt does not throw away a warm cache.
    if (successfulSignupIds.length > 0) revalidateEventPage(campaign_id);
    const payload = {
      results,
      primary_cancel_token: successfulCancelTokens[0] ?? null,
      success_count: successfulSessionIds.length,
    };
    if (storeKey) await store.set(storeKey, payload);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof SupabaseTimeoutError) {
      console.error("Bulk signup timed out:", error.message);
      captureServerException(error, {
        route: "/api/signups/bulk",
        properties: { kind: "supabase_timeout" },
      });
      return NextResponse.json(
        { error: SIGNUP_TIMEOUT_MESSAGE },
        { status: 503 },
      );
    }
    console.error("Error creating bulk signup:", error);
    captureServerException(error, { route: "/api/signups/bulk" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length > 0 ? email : null;
}

type ReusedSlot = { session_id: string; signup_id: string; cancel_token: string | null };

async function reuseEmailSignup(
  admin: ReturnType<typeof createClient>,
  sessionId: string,
  campaignId: string,
  memberEmail: unknown,
): Promise<ReusedSlot | null> {
  // A timeout or lookup error must not fall through to another insert: the
  // first attempt may already have committed. The route catch returns 503.
  const { data } = await withSupabaseTimeout(
    (signal) =>
      admin
        .from("signups")
        .select("id, session_id, member_email, cancel_token, signed_up_at")
        .eq("session_id", sessionId)
        .eq("campaign_id", campaignId)
        .gte("signed_up_at", new Date(Date.now() - 30 * 60_000).toISOString())
        .abortSignal(signal),
    "signups email dedupe",
  );
  const row = findReusableEmailSignup((data ?? []) as Array<{
    id: string;
    session_id: string;
    member_email?: string | null;
    cancel_token?: string | null;
    signed_up_at: string;
  }>, { sessionId, memberEmail });
  if (!row) return null;
  return {
    session_id: sessionId,
    signup_id: row.id,
    cancel_token: row.cancel_token ?? null,
  };
}
