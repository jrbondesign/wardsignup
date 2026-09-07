import { escapeHtml } from "@/lib/html-escape";
import {
  participantEmailFrom,
  publicSiteOriginAndBrandForCampaign,
  type PublicBrand,
} from "@/lib/brand";
import { buildParticipantEmailFooterHtml } from "@/lib/site-footer";
import { formatSessionSlotLabel } from "@/lib/organizer-email";
import { hasResendConfiguredForBrand } from "@/lib/resend-for-brand";
import { sendGuardedEmail } from "@/lib/email-send";
import type { Campaign } from "@/lib/types";

type SessionFields = {
  day_of_week: number;
  time: string;
  end_time: string | null;
  session_date: string | null;
};

export type ParticipantCampaignEmailFields = Pick<
  Campaign,
  "id" | "name" | "brand_id" | "public_host" | "event_timezone" | "event_end_date"
>;

function eventLink(siteOrigin: string, campaignId: string): string {
  const base = siteOrigin.replace(/\/$/, "");
  return `${base}/event/${campaignId}`;
}

function participantFooter(brand: PublicBrand): string {
  return buildParticipantEmailFooterHtml(brand);
}

/** "2026-04-18" + "17:00" → "20260418T170000" */
function toCalDate(date: string, time: string): string {
  return date.replace(/-/g, "") + "T" + time.replace(":", "") + "00";
}

/** "17:00" → "18:00" */
function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function buildGoogleCalendarUrl(
  session: SessionFields,
  campaignName: string,
  eventUrl: string,
  timezone: string | null | undefined,
  eventEndDate?: string | null,
): string | null {
  if (!session.session_date || !session.time) return null;
  const start = toCalDate(session.session_date, session.time);
  const endTime = session.end_time ?? addOneHour(session.time);
  const end = toCalDate(session.session_date, endTime);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: campaignName,
    dates: `${start}/${end}`,
    details: `Sign up or manage your spot: ${eventUrl}`,
    ...(timezone ? { ctz: timezone } : {}),
  });
  // Multi-day events: emit a daily recurrence rule so the same start/end time
  // repeats across each day in the range.
  if (
    eventEndDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(eventEndDate) &&
    eventEndDate > session.session_date
  ) {
    params.set("recur", `RRULE:FREQ=DAILY;UNTIL=${eventEndDate.replace(/-/g, "")}T235959Z`);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export async function sendParticipantSignupConfirmation(params: {
  to: string;
  memberName: string;
  campaign: ParticipantCampaignEmailFields;
  session: SessionFields;
  cancelUrl?: string;
  cancelToken?: string;
  guestNames?: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { siteOrigin, brand } = publicSiteOriginAndBrandForCampaign(params.campaign);
  if (!hasResendConfiguredForBrand(brand)) {
    return { ok: false, error: "Resend not configured for brand" };
  }

  const slotLabel = formatSessionSlotLabel(params.session, {
    eventTimezone: params.campaign.event_timezone,
  });
  const eventTitle = escapeHtml(params.campaign.name);
  const name = escapeHtml(params.memberName.trim());
  const link = eventLink(siteOrigin, params.campaign.id);
  const cancelLink = params.cancelUrl
    ? `&nbsp;·&nbsp;<a href="${escapeHtml(params.cancelUrl)}" style="color:#5A8399;">Cancel my signup</a>`
    : "";

  const guests = params.guestNames?.filter(Boolean) ?? [];
  const guestLine = guests.length > 0
    ? `<p style="margin:0 0 8px;font-size:15px;"><strong>Attending with you:</strong> ${escapeHtml(guests.join(", "))}</p>`
    : "";

  // Calendar links — only when there's a specific date
  const googleCalUrl = buildGoogleCalendarUrl(
    params.session,
    params.campaign.name,
    link,
    params.campaign.event_timezone,
    params.campaign.event_end_date ?? null,
  );
  const successPageUrl = params.cancelToken
    ? `${siteOrigin}/signup-success/${params.cancelToken}`
    : null;
  const calendarBlock = googleCalUrl
    ? `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;">
      <tr>
        <td style="padding-bottom:8px;font-size:12px;font-weight:600;color:#5A8399;text-transform:uppercase;letter-spacing:0.5px;">Add to calendar</td>
      </tr>
      <tr>
        <td>
          <a href="${escapeHtml(googleCalUrl)}" style="display:inline-block;margin-right:8px;padding:8px 16px;border-radius:8px;border:1.5px solid rgba(14,150,176,0.30);font-size:13px;font-weight:600;color:#0E96B0;text-decoration:none;">Google Calendar</a>${successPageUrl ? `<a href="${escapeHtml(successPageUrl)}" style="display:inline-block;padding:8px 16px;border-radius:8px;border:1.5px solid rgba(14,150,176,0.30);font-size:13px;font-weight:600;color:#0E96B0;text-decoration:none;">Apple / Outlook (.ics)</a>` : ""}
        </td>
      </tr>
    </table>`
    : "";

  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#0D2B35;max-width:560px;width:100%;box-sizing:border-box;padding:0 4px;word-wrap:break-word;">
    <p style="margin:0 0 12px;font-size:16px;">Hi ${name},</p>
    <p style="margin:0 0 12px;font-size:15px;">You&apos;re signed up for <strong>${eventTitle}</strong>.</p>
    <p style="margin:0 0 8px;font-size:15px;"><strong>When:</strong> ${escapeHtml(slotLabel)}</p>
    ${params.session.session_date ? `<p style="margin:0 0 12px;font-size:13px;color:#5A8399;">We&apos;ll send you a reminder the day before.</p>` : ""}
    ${guestLine}
    ${calendarBlock}
    <p style="margin:20px 0 0;font-size:14px;">
      <a href="${escapeHtml(link)}" style="color:#0E96B0;font-weight:600;">View event</a>${cancelLink}
    </p>
    ${participantFooter(brand)}
  </div>`;

  const from = participantEmailFrom(brand);
  const send = await sendGuardedEmail({
    brand,
    category: "transactional",
    from,
    to: params.to.trim(),
    subject: `You’re signed up: ${params.campaign.name}`,
    html,
  });

  if (!send.ok) {
    return { ok: false, error: send.error || send.skipped || "send failed" };
  }
  return { ok: true };
}

export async function sendParticipantReminderEmail(params: {
  to: string;
  memberName: string;
  campaign: ParticipantCampaignEmailFields;
  session: SessionFields;
  cancelUrl?: string;
  cancelToken?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { siteOrigin, brand } = publicSiteOriginAndBrandForCampaign(params.campaign);
  if (!hasResendConfiguredForBrand(brand)) {
    return { ok: false, error: "Resend not configured for brand" };
  }

  const slotLabel = formatSessionSlotLabel(params.session, {
    eventTimezone: params.campaign.event_timezone,
  });
  const eventTitle = escapeHtml(params.campaign.name);
  const name = escapeHtml(params.memberName.trim());
  const link = eventLink(siteOrigin, params.campaign.id);
  const cancelLink = params.cancelUrl
    ? `&nbsp;·&nbsp;<a href="${escapeHtml(params.cancelUrl)}" style="color:#5A8399;">Cancel my signup</a>`
    : "";

  // Calendar links
  const googleCalUrl = buildGoogleCalendarUrl(
    params.session,
    params.campaign.name,
    link,
    params.campaign.event_timezone,
    params.campaign.event_end_date ?? null,
  );
  const successPageUrl = params.cancelToken
    ? `${siteOrigin}/signup-success/${params.cancelToken}`
    : null;
  const calendarBlock = googleCalUrl
    ? `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;">
      <tr>
        <td style="padding-bottom:8px;font-size:12px;font-weight:600;color:#5A8399;text-transform:uppercase;letter-spacing:0.5px;">Add to calendar</td>
      </tr>
      <tr>
        <td>
          <a href="${escapeHtml(googleCalUrl)}" style="display:inline-block;margin-right:8px;padding:8px 16px;border-radius:8px;border:1.5px solid rgba(14,150,176,0.30);font-size:13px;font-weight:600;color:#0E96B0;text-decoration:none;">Google Calendar</a>${successPageUrl ? `<a href="${escapeHtml(successPageUrl)}" style="display:inline-block;padding:8px 16px;border-radius:8px;border:1.5px solid rgba(14,150,176,0.30);font-size:13px;font-weight:600;color:#0E96B0;text-decoration:none;">Apple / Outlook (.ics)</a>` : ""}
        </td>
      </tr>
    </table>`
    : "";

  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#0D2B35;max-width:560px;width:100%;box-sizing:border-box;padding:0 4px;word-wrap:break-word;">
    <p style="margin:0 0 12px;font-size:16px;">Hi ${name},</p>
    <p style="margin:0 0 12px;font-size:15px;">You signed up for <strong>${eventTitle}</strong> and it&apos;s coming up in about 24 hours.</p>
    <p style="margin:0 0 8px;font-size:15px;"><strong>When:</strong> ${escapeHtml(slotLabel)}</p>
    ${calendarBlock}
    <p style="margin:20px 0 0;font-size:14px;">
      <a href="${escapeHtml(link)}" style="color:#0E96B0;font-weight:600;">View event</a>${cancelLink}
    </p>
    ${participantFooter(brand)}
  </div>`;

  const from = participantEmailFrom(brand);
  const send = await sendGuardedEmail({
    brand,
    category: "notification",
    from,
    to: params.to.trim(),
    subject: `Reminder tomorrow: ${params.campaign.name}`,
    html,
  });

  if (!send.ok) {
    return { ok: false, error: send.error || send.skipped || "send failed" };
  }
  return { ok: true };
}

export async function sendParticipantBatchSignupConfirmation(params: {
  to: string;
  memberName: string;
  campaign: ParticipantCampaignEmailFields;
  sessions: SessionFields[];
  cancelUrl?: string;
  cancelToken?: string;
  /** Per-slot cancel URLs, aligned with `sessions`. Each signup row has its own
   * cancel token, so a single `cancelUrl` can only ever cancel one slot. */
  sessionCancelUrls?: (string | null)[];
  guestNames?: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (params.sessions.length === 0) {
    return { ok: false, error: "No sessions to confirm" };
  }

  // Single-slot batch: reuse the existing single-slot template verbatim so the
  // email looks identical to the pre-bulk-endpoint behavior for that case.
  if (params.sessions.length === 1) {
    return sendParticipantSignupConfirmation({
      to: params.to,
      memberName: params.memberName,
      campaign: params.campaign,
      session: params.sessions[0],
      cancelUrl: params.cancelUrl,
      cancelToken: params.cancelToken,
      guestNames: params.guestNames,
    });
  }

  const { siteOrigin, brand } = publicSiteOriginAndBrandForCampaign(params.campaign);
  if (!hasResendConfiguredForBrand(brand)) {
    return { ok: false, error: "Resend not configured for brand" };
  }

  const eventTitle = escapeHtml(params.campaign.name);
  const name = escapeHtml(params.memberName.trim());
  const link = eventLink(siteOrigin, params.campaign.id);
  const cancelLink = params.cancelUrl
    ? `&nbsp;·&nbsp;<a href="${escapeHtml(params.cancelUrl)}" style="color:#5A8399;">Manage my signups</a>`
    : "";

  const guests = params.guestNames?.filter(Boolean) ?? [];
  const guestLine = guests.length > 0
    ? `<p style="margin:0 0 8px;font-size:15px;"><strong>Attending with you:</strong> ${escapeHtml(guests.join(", "))}</p>`
    : "";

  const slotItems = params.sessions
    .map((s, i) => {
      const slotCancelUrl = params.sessionCancelUrls?.[i];
      const slotCancel = slotCancelUrl
        ? `&nbsp;·&nbsp;<a href="${escapeHtml(slotCancelUrl)}" style="color:#5A8399;font-size:13px;">Cancel</a>`
        : "";
      return `<li style="margin:0 0 4px;font-size:15px;">${escapeHtml(
        formatSessionSlotLabel(s, { eventTimezone: params.campaign.event_timezone }),
      )}${slotCancel}</li>`;
    })
    .join("");

  // One calendar link per session — slot times/dates can differ across the batch
  // so we don't merge into a recurrence here.
  const calendarLinks = params.sessions
    .map((s) =>
      buildGoogleCalendarUrl(
        s,
        params.campaign.name,
        link,
        params.campaign.event_timezone,
        params.campaign.event_end_date ?? null,
      ),
    )
    .filter((u): u is string => Boolean(u));

  // Single Apple/Outlook download covers every slot in one click — the .ics
  // endpoint returns one VEVENT per slot. Google's "Add to Calendar" URL only
  // supports a single event, so we still emit one Google button per slot.
  const icsAllUrl = params.cancelToken
    ? `${siteOrigin}/api/signups/calendar/${params.cancelToken}`
    : null;

  const calendarButtons = calendarLinks
    .map((url, i) => {
      const label = formatSessionSlotLabel(params.sessions[i], { eventTimezone: params.campaign.event_timezone });
      return `<a href="${escapeHtml(url)}" style="display:inline-block;margin:0 8px 8px 0;padding:8px 16px;border-radius:8px;border:1.5px solid rgba(14,150,176,0.30);font-size:13px;font-weight:600;color:#0E96B0;text-decoration:none;">Google: ${escapeHtml(label)}</a>`;
    })
    .join("");

  const calendarBlock = calendarLinks.length > 0
    ? `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;">
      <tr>
        <td style="padding-bottom:8px;font-size:12px;font-weight:600;color:#5A8399;text-transform:uppercase;letter-spacing:0.5px;">Add to calendar</td>
      </tr>
      <tr>
        <td>
          ${icsAllUrl ? `<a href="${escapeHtml(icsAllUrl)}" style="display:inline-block;margin:0 8px 8px 0;padding:8px 16px;border-radius:8px;border:1.5px solid rgba(14,150,176,0.30);font-size:13px;font-weight:600;color:#0E96B0;text-decoration:none;">Apple / Outlook (.ics) — all ${params.sessions.length} slots</a>` : ""}
          ${calendarButtons}
        </td>
      </tr>
    </table>`
    : "";

  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#0D2B35;max-width:560px;width:100%;box-sizing:border-box;padding:0 4px;word-wrap:break-word;">
    <p style="margin:0 0 12px;font-size:16px;">Hi ${name},</p>
    <p style="margin:0 0 12px;font-size:15px;">You&apos;re signed up for <strong>${eventTitle}</strong> for the following slots:</p>
    <ul style="margin:0 0 12px 18px;padding:0;">${slotItems}</ul>
    <p style="margin:0 0 12px;font-size:13px;color:#5A8399;">We&apos;ll send you a reminder the day before each one.</p>
    ${guestLine}
    ${calendarBlock}
    <p style="margin:20px 0 0;font-size:14px;">
      <a href="${escapeHtml(link)}" style="color:#0E96B0;font-weight:600;">View event</a>${cancelLink}
    </p>
    ${participantFooter(brand)}
  </div>`;

  const from = participantEmailFrom(brand);
  const send = await sendGuardedEmail({
    brand,
    category: "transactional",
    from,
    to: params.to.trim(),
    subject: `You’re signed up: ${params.campaign.name} (${params.sessions.length} slots)`,
    html,
  });

  if (!send.ok) {
    return { ok: false, error: send.error || send.skipped || "send failed" };
  }
  return { ok: true };
}
