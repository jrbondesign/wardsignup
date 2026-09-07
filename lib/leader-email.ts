import { escapeHtml } from "@/lib/html-escape";
import {
  leaderEmailFrom,
  publicSiteOriginAndBrandForCampaign,
} from "@/lib/brand";
import { buildOrganizerEmailFooterHtml } from "@/lib/site-footer";
import { formatSessionSlotLabel } from "@/lib/organizer-email";
import { hasResendConfiguredForBrand } from "@/lib/resend-for-brand";
import { consumeEmailKeyRate, sendGuardedEmail } from "@/lib/email-send";
import { buildEventIcs, icsFilenameForCampaign, type IcsSession } from "@/lib/ics";
import type { Campaign } from "@/lib/types";

type SessionFields = IcsSession & { day_of_week: number };

export type LeaderCampaignEmailFields = Pick<
  Campaign,
  | "id"
  | "name"
  | "brand_id"
  | "public_host"
  | "event_timezone"
  | "event_end_date"
  | "leader_name"
  | "leader_email"
>;

/**
 * Emails the event's assigned leader that someone signed up, with an .ics
 * attachment for the slot(s) so the leader can drop it on their calendar.
 * No-op when the campaign has no leader_email. Never throws.
 */
export async function sendLeaderSignupNotification(params: {
  campaign: LeaderCampaignEmailFields;
  /** The slot(s) just signed up for. Empty for items events (no timed slot). */
  sessions: SessionFields[];
  memberName: string;
  memberEmail?: string | null;
  memberPhone?: string | null;
  guestNames?: string[];
  signupNote?: string | null;
  /** items events: what was claimed, e.g. "Rolls × 2". */
  itemLabel?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const leaderEmail = params.campaign.leader_email?.trim();
  if (!leaderEmail) return { ok: false, error: "No leader assigned" };

  const { siteOrigin, brand } = publicSiteOriginAndBrandForCampaign(params.campaign);
  if (!hasResendConfiguredForBrand(brand)) {
    return { ok: false, error: "Resend not configured for brand" };
  }

  // A signup burst on a popular event otherwise means one leader email per
  // signup with no ceiling. Cap per campaign per hour; overflow is visible on
  // the admin page, which the email links to anyway.
  const underCap = await consumeEmailKeyRate(
    "leader_notify",
    `leader:${params.campaign.id}`,
    10,
  );
  if (!underCap) {
    return { ok: false, error: "leader notification hourly cap reached" };
  }

  const eventTitle = escapeHtml(params.campaign.name);
  const memberName = escapeHtml(params.memberName.trim());
  const leaderName = params.campaign.leader_name?.trim();
  const greeting = leaderName ? `Hi ${escapeHtml(leaderName)},` : "Hello,";
  const adminLink = `${siteOrigin.replace(/\/$/, "")}/admin/${params.campaign.id}`;

  const slotLines = params.sessions
    .map(
      (s) =>
        `<li style="margin:0 0 4px;font-size:15px;">${escapeHtml(
          formatSessionSlotLabel(s, { eventTimezone: params.campaign.event_timezone }),
        )}</li>`,
    )
    .join("");
  const slotBlock = slotLines
    ? `<p style="margin:0 0 4px;font-size:15px;"><strong>When:</strong></p><ul style="margin:0 0 12px 18px;padding:0;">${slotLines}</ul>`
    : "";

  const detailLines: string[] = [];
  if (params.itemLabel?.trim()) {
    detailLines.push(`<strong>Bringing:</strong> ${escapeHtml(params.itemLabel.trim())}`);
  }
  if (params.memberEmail?.trim()) {
    detailLines.push(`<strong>Email:</strong> ${escapeHtml(params.memberEmail.trim())}`);
  }
  if (params.memberPhone?.trim()) {
    detailLines.push(`<strong>Phone:</strong> ${escapeHtml(params.memberPhone.trim())}`);
  }
  const guests = params.guestNames?.filter(Boolean) ?? [];
  if (guests.length > 0) {
    detailLines.push(`<strong>Bringing guests:</strong> ${escapeHtml(guests.join(", "))}`);
  }
  if (params.signupNote?.trim()) {
    detailLines.push(`<strong>Note:</strong> ${escapeHtml(params.signupNote.trim())}`);
  }
  const detailBlock = detailLines
    .map((l) => `<p style="margin:0 0 6px;font-size:15px;">${l}</p>`)
    .join("");

  const eventUrl = `${siteOrigin.replace(/\/$/, "")}/event/${params.campaign.id}`;
  const ics = buildEventIcs({
    sessions: params.sessions,
    campaignName: params.campaign.name,
    eventUrl,
    timezone: params.campaign.event_timezone,
    campaignEventEndDate: params.campaign.event_end_date ?? null,
    campaignId: params.campaign.id,
  });

  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#0D2B35;max-width:560px;width:100%;box-sizing:border-box;padding:0 4px;word-wrap:break-word;">
    <p style="margin:0 0 12px;font-size:16px;">${greeting}</p>
    <p style="margin:0 0 12px;font-size:15px;"><strong>${memberName}</strong> just signed up for <strong>${eventTitle}</strong>.</p>
    ${slotBlock}
    ${detailBlock}
    <p style="margin:20px 0 0;font-size:14px;">
      <a href="${escapeHtml(adminLink)}" style="color:#0E96B0;font-weight:600;">View all signups</a>
    </p>
    <p style="margin:12px 0 0;font-size:12px;color:#5A8399;">You receive this because you're the assigned leader for this event.${ics ? " A calendar file is attached." : ""}</p>
    ${buildOrganizerEmailFooterHtml(brand)}
  </div>`;

  try {
    const send = await sendGuardedEmail({
      brand,
      category: "notification",
      from: leaderEmailFrom(brand),
      to: leaderEmail,
      subject: `New signup: ${params.memberName.trim()} — ${params.campaign.name}`,
      html,
      ...(ics
        ? {
            attachments: [
              {
                filename: icsFilenameForCampaign(params.campaign.name),
                content: Buffer.from(ics).toString("base64"),
              },
            ],
          }
        : {}),
    });
    if (!send.ok) return { ok: false, error: send.error || send.skipped || "send failed" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
