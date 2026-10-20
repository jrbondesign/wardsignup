/**
 * Weekly signup email capture rate for the founder metrics page:
 * signups with a non empty member_email divided by all signups, bucketed into
 * Monday to Sunday weeks in America/Phoenix (UTC-7, no DST).
 */

import { MS_DAY, phoenixWeekKey, phoenixWeekStartUtc } from "@/lib/phoenix-time";
import { isRealOrgId } from "@/lib/test-orgs";

export { phoenixWeekStartUtc };

export type CaptureSignupRow = { signed_up_at: string; member_email: string | null; campaign_id?: string | null };

export type EmailCaptureWeek = {
  /** Phoenix Monday, YYYY-MM-DD. */
  weekStart: string;
  total: number;
  withEmail: number;
  /** withEmail / total as a percentage with one decimal, null when total is 0. */
  ratePct: number | null;
};

export type EmailCapturePooled = {
  weeks: number;
  total: number;
  withEmail: number;
  ratePct: number | null;
};

export type EmailCaptureRate = {
  thisWeek: EmailCaptureWeek;
  /** Most recent completed weeks, oldest first. */
  completedWeeks: EmailCaptureWeek[];
  /** Pooled rate over the last 4 completed weeks: sum(with email) / sum(signups). */
  rolling4Week: EmailCapturePooled;
};

function pct(withEmail: number, total: number): number | null {
  return total === 0 ? null : Math.round((1000 * withEmail) / total) / 10;
}

/** Pool the last `n` completed weeks into one rate. */
export function pooledRate(completedWeeks: ReadonlyArray<EmailCaptureWeek>, n = 4): EmailCapturePooled {
  const last = completedWeeks.slice(-n);
  const total = last.reduce((a, w) => a + w.total, 0);
  const withEmail = last.reduce((a, w) => a + w.withEmail, 0);
  return { weeks: last.length, total, withEmail, ratePct: pct(withEmail, total) };
}

/**
 * Campaigns owned by test / team accounts (founderNotifySkipEmails, the same
 * marker the New wards metric uses). A campaign is excluded when its creator,
 * its user_email, or its organization's owner is a skip email.
 */
export function testCampaignIds(opts: {
  campaigns: ReadonlyArray<{ id: string; created_by: string | null; user_email: string | null; organization_id?: string | null }>;
  orgOwnerById: ReadonlyMap<string, string | null>;
  emailByUserId: ReadonlyMap<string, string | null | undefined>;
  skipEmails: ReadonlySet<string>;
}): Set<string> {
  const { campaigns, orgOwnerById, emailByUserId, skipEmails } = opts;
  const isSkip = (email: string | null | undefined) => !!email && skipEmails.has(email.trim().toLowerCase());
  const isSkipUser = (userId: string | null | undefined) => !!userId && isSkip(emailByUserId.get(userId));
  const out = new Set<string>();
  for (const c of campaigns) {
    // Real wards (e.g. Sweetwater Branch) always count, even when a founder account made the event.
    if (isRealOrgId(c.organization_id)) continue;
    const orgOwner = c.organization_id ? orgOwnerById.get(c.organization_id) : null;
    if (isSkip(c.user_email) || isSkipUser(c.created_by) || isSkipUser(orgOwner)) out.add(c.id);
  }
  return out;
}

/** Phoenix Monday key for a week start instant (shared helper in lib/phoenix-time). */
function weekKey(startUtc: Date): string {
  return phoenixWeekKey(startUtc);
}

export function hasEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.trim() !== "";
}

/** Oldest instant needed to compute `completedWeekCount` full weeks plus this week. */
export function emailCaptureWindowStart(now: Date, completedWeekCount: number): Date {
  return new Date(phoenixWeekStartUtc(now).getTime() - completedWeekCount * 7 * MS_DAY);
}

export function computeEmailCaptureRate(
  rows: ReadonlyArray<CaptureSignupRow>,
  now: Date,
  completedWeekCount = 8,
  excludeCampaignIds: ReadonlySet<string> = new Set(),
): EmailCaptureRate {
  const currentStart = phoenixWeekStartUtc(now);
  const starts: Date[] = [];
  for (let i = completedWeekCount; i >= 0; i -= 1) {
    starts.push(new Date(currentStart.getTime() - i * 7 * MS_DAY));
  }
  const buckets = starts.map((s) => ({ weekStart: weekKey(s), startMs: s.getTime(), total: 0, withEmail: 0 }));
  const firstMs = buckets[0]!.startMs;
  const endMs = currentStart.getTime() + 7 * MS_DAY;
  for (const r of rows) {
    if (r.campaign_id && excludeCampaignIds.has(r.campaign_id)) continue;
    const t = new Date(r.signed_up_at).getTime();
    if (Number.isNaN(t) || t < firstMs || t >= endMs) continue;
    const idx = Math.floor((t - firstMs) / (7 * MS_DAY));
    const b = buckets[idx]!;
    b.total += 1;
    if (hasEmail(r.member_email)) b.withEmail += 1;
  }
  const weeks: EmailCaptureWeek[] = buckets.map(({ weekStart, total, withEmail }) => ({
    weekStart,
    total,
    withEmail,
    ratePct: pct(withEmail, total),
  }));
  const completedWeeks = weeks.slice(0, -1);
  return { thisWeek: weeks[weeks.length - 1]!, completedWeeks, rolling4Week: pooledRate(completedWeeks, 4) };
}
