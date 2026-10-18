import { escapeHtml } from "@/lib/html-escape";
import {
  leaderEmailFrom,
  publicSiteOriginAndBrandForCampaign,
} from "@/lib/brand";
import { buildOrganizerEmailFooterHtml } from "@/lib/site-footer";
import { formatSessionSlotLabel } from "@/lib/organizer-email";
import { hasResendConfiguredForBrand } from "@/lib/resend-for-brand";
import { consumeEmailKeyRate, sendGuardedEmail } from "@/lib/email-send";
import { leaderCoveredByOrganizerAlerts, leaderNotifyMaxPerHour } from "@/lib/email-throttle";
import { buildEventIcs, icsFilenameForCampaign, type IcsSession } from "@/lib/ics";
import type { Campaign } from "@/lib/types";
import { withUtm } from "@/lib/utm";

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
> &
  Partial<Pick<Campaign, "user_email" | "organizer_instant_notify_enabled" | "leader_signup_email_enabled">>;

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
  // Per-signup leader emails are now disabled entirely — all signups appear in
  // the daily digest instead (organizer-digest cron), which the leader receives
  // when they're not already getting organizer alerts.
  return { ok: false, error: "per signup leader emails disabled, covered by digest" };
}
