/**
 * Google Calendar connection health.
 *
 * Goal: sync never stops silently. When Google rejects our refresh token
 * (invalid_grant, revoked, expired) or answers 401 after a fresh refresh, the
 * connection is marked broken exactly once per breakage. That first transition
 * emails the creator a reconnect link and emails the founder, and is logged.
 * Reconnecting through the OAuth flow clears the broken state.
 */

import { creatorNotifyEmailFrom, getDefaultPublicBrand, publicSiteOriginAndBrandForCampaign } from "@/lib/brand";
import type { PublicBrand } from "@/lib/brand/types";
import { sendGuardedEmail } from "@/lib/email-send";
import { FOUNDER_NOTIFY_TO } from "@/lib/founder-notify";
import { escapeHtml } from "@/lib/html-escape";

import { CONNECTION_BROKEN_ERROR } from "@/lib/google-calendar-connection";

export { CONNECTION_BROKEN_ERROR, isConnectionBroken } from "@/lib/google-calendar-connection";

/** Thrown by Calendar API helpers when Google answers 401 after a refresh. */
export class GoogleAuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "GoogleAuthError";
    this.status = status;
  }
}

/** True when an error means the stored grant is dead and the user must reconnect. */
export function isGoogleAuthFailure(err: unknown, status?: number): boolean {
  if (err instanceof GoogleAuthError) return true;
  if (status === 401) return true;
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return (
    msg.includes("invalid_grant") ||
    msg.includes("invalid grant") ||
    msg.includes("expired or revoked") ||
    msg.includes("token has been revoked") ||
    msg.includes("reauthorization needed")
  );
}

export function reconnectUrl(siteOrigin: string, campaignId: string): string {
  return `${siteOrigin.replace(/\/$/, "")}/admin/${encodeURIComponent(campaignId)}?reconnect_google=1`;
}

export function buildCreatorReconnectEmail(opts: {
  brand: PublicBrand;
  eventName: string;
  googleEmail: string;
  link: string;
}): { subject: string; html: string; text: string } {
  const { brand, eventName, googleEmail, link } = opts;
  const subject = `Reconnect Google Calendar for ${eventName}`;
  const text = [
    `Google stopped accepting the calendar connection for ${googleEmail}.`,
    `New signups for ${eventName} are not being added to your Google Calendar until you reconnect.`,
    `Reconnect here: ${link}`,
    `It takes about a minute. Once you reconnect, we will catch your calendar up automatically.`,
    `${brand.name}`,
  ].join("\n\n");
  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">
      <h2 style="margin: 0 0 12px; font-size: 18px;">Reconnect Google Calendar</h2>
      <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.6;">Google stopped accepting the calendar connection for <strong>${escapeHtml(googleEmail)}</strong>.</p>
      <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6;">New signups for <strong>${escapeHtml(eventName)}</strong> are not being added to your Google Calendar until you reconnect.</p>
      <p style="margin: 0 0 16px;"><a href="${escapeHtml(link)}" style="display: inline-block; background: #0E96B0; color: #fff; padding: 10px 18px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 14px;">Reconnect Google</a></p>
      <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.6;">It takes about a minute. Once you reconnect, we will catch your calendar up automatically.</p>
    </div>`;
  return { subject, html, text };
}

type Admin = { from: (table: string) => any; auth?: any };

export type MarkBrokenInput = {
  connectionId: string;
  campaignId?: string | null;
  reason: string;
};

/**
 * Mark a connection broken. Idempotent: only the first call per breakage
 * (status active to broken) sends notifications. Never throws.
 * Returns true when this call performed the transition.
 */
export async function markConnectionBroken(admin: Admin, input: MarkBrokenInput): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const reason = input.reason.slice(0, 500);
  try {
    // Legacy fields (pre migration UI and pickDisplayedConnection rely on them).
    await admin
      .from("google_calendar_connections")
      .update({ revoked_at: nowIso, last_error: `Invalid grant - reauthorization needed: ${reason}`.slice(0, 500) })
      .eq("id", input.connectionId);

    await admin
      .from("campaign_calendar_sync")
      .update({ last_error: CONNECTION_BROKEN_ERROR })
      .eq("connection_id", input.connectionId);

    // Atomic transition: only one caller wins the active to broken update.
    const { data, error } = await admin
      .from("google_calendar_connections")
      .update({ status: "broken", broken_at: nowIso, broken_reason: reason })
      .eq("id", input.connectionId)
      .eq("status", "active")
      .select("id, user_id, organization_id, google_email");

    if (error) {
      console.error("[gcal-health] could not set broken status (migration applied?):", error.message ?? error);
      return false;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      console.warn(`[gcal-health] connection ${input.connectionId} already broken; not notifying again`);
      return false;
    }

    console.error(
      `[gcal-health] CONNECTION BROKEN connection=${row.id} org=${row.organization_id} user=${row.user_id} campaign=${input.campaignId ?? "n/a"} reason=${reason}`,
    );

    await notifyBroken(admin, row, input.campaignId ?? null, reason);

    await admin
      .from("google_calendar_connections")
      .update({ broken_notified_at: new Date().toISOString() })
      .eq("id", row.id);
    return true;
  } catch (e) {
    console.error("[gcal-health] markConnectionBroken failed:", e);
    return false;
  }
}

async function notifyBroken(
  admin: Admin,
  row: { id: string; user_id: string; organization_id: string; google_email: string },
  campaignId: string | null,
  reason: string,
): Promise<void> {
  // Pick an event to link to: the one that failed, else any synced event on this connection.
  let eventId = campaignId;
  if (!eventId) {
    const { data } = await admin
      .from("campaign_calendar_sync")
      .select("campaign_id")
      .eq("connection_id", row.id)
      .limit(1);
    eventId = (Array.isArray(data) ? data[0]?.campaign_id : null) ?? null;
  }

  let eventName = "your event";
  let brand = getDefaultPublicBrand();
  let siteOrigin = brand.siteUrl.replace(/\/$/, "");
  if (eventId) {
    const { data: campaign } = await admin
      .from("campaigns")
      .select("id, name, brand_id, public_host")
      .eq("id", eventId)
      .maybeSingle();
    if (campaign) {
      eventName = campaign.name || eventName;
      const resolved = publicSiteOriginAndBrandForCampaign(campaign);
      brand = resolved.brand;
      siteOrigin = resolved.siteOrigin;
    }
  }
  const link = eventId ? reconnectUrl(siteOrigin, eventId) : `${siteOrigin}/settings/organization`;

  let creatorEmail: string | null = null;
  try {
    const res = await admin.auth?.admin?.getUserById?.(row.user_id);
    creatorEmail = res?.data?.user?.email ?? null;
  } catch (e) {
    console.error("[gcal-health] creator lookup failed:", e);
  }

  if (creatorEmail) {
    const mail = buildCreatorReconnectEmail({ brand, eventName, googleEmail: row.google_email, link });
    const sent = await sendGuardedEmail({
      brand,
      category: "transactional",
      from: creatorNotifyEmailFrom(brand),
      to: creatorEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      // Sync is already broken; never let the email queue defer this.
      urgent: true,
    });
    if (!sent.ok) console.error("[gcal-health] creator reconnect email not sent:", sent);
  } else {
    console.error(`[gcal-health] no creator email for user ${row.user_id}`);
  }

  const founderText = [
    `Google Calendar connection broke and was marked broken.`,
    `Creator: ${creatorEmail ?? "(unknown)"}`,
    `Google account: ${row.google_email}`,
    `Event: ${eventName}${eventId ? ` (${eventId})` : ""}`,
    `Org: ${row.organization_id}`,
    `Connection: ${row.id}`,
    `Reason: ${reason}`,
    `Creator reconnect link: ${link}`,
  ].join("\n");
  const founder = await sendGuardedEmail({
    brand,
    category: "transactional",
    from: creatorNotifyEmailFrom(brand),
    to: FOUNDER_NOTIFY_TO,
    subject: `Google Calendar sync broke: ${eventName}`,
    html: `<pre style="font-family: ui-monospace, Menlo, monospace; font-size: 13px; white-space: pre-wrap;">${escapeHtml(founderText)}</pre>`,
    text: founderText,
  });
  if (!founder.ok) console.error("[gcal-health] founder alert email not sent:", founder);
}

/** Clear broken state after a successful reconnect. Never throws. */
export async function clearConnectionBroken(admin: Admin, connectionId: string): Promise<void> {
  try {
    const { error } = await admin
      .from("google_calendar_connections")
      .update({ status: "active", broken_at: null, broken_reason: null, broken_notified_at: null })
      .eq("id", connectionId);
    if (error) console.error("[gcal-health] clear broken status failed (migration applied?):", error.message ?? error);
    await admin
      .from("campaign_calendar_sync")
      .update({ enabled: true, last_error: null })
      .eq("connection_id", connectionId)
      .eq("last_error", CONNECTION_BROKEN_ERROR);
  } catch (e) {
    console.error("[gcal-health] clearConnectionBroken failed:", e);
  }
}
