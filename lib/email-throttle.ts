/**
 * Small, pure helpers that keep WardSignup under its daily email budget.
 * Kept free of IO so they are easy to unit test.
 */

/** Lowercase and trim an email address so "Ky@x.com " and "ky@x.com" match. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Minimum hours between organizer faster alerts for one event. Default 3. */
export function fasterAlertMinHours(
  env: Record<string, string | undefined> = process.env,
): number {
  const n = Number(env.ORGANIZER_FASTER_ALERT_MIN_HOURS);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

/**
 * True when the last faster alert for an event went out less than
 * `minHours` ago. The watermark only moves when an alert is sent, so a
 * throttled run keeps every new signup for the next alert.
 */
export function isFasterAlertThrottled(
  lastSentIso: string | null | undefined,
  now: Date,
  minHours: number,
): boolean {
  if (!lastSentIso) return false;
  const last = new Date(lastSentIso).getTime();
  if (!Number.isFinite(last)) return false;
  return now.getTime() - last < minHours * 60 * 60 * 1000;
}

export type LeaderCoverageFields = {
  leader_email?: string | null;
  user_email?: string | null;
  organizer_instant_notify_enabled?: boolean | null;
};

/**
 * True when the assigned leader already gets organizer faster alerts for this
 * event (faster alerts are on and the leader is the organizer address).
 * Note: Per-signup leader emails are now disabled entirely (PR #81 Oct 2026);
 * this helper remains for reference but is no longer used in email send logic.
 */
export function leaderCoveredByOrganizerAlerts(c: LeaderCoverageFields): boolean {
  if (!c.organizer_instant_notify_enabled) return false;
  const leader = c.leader_email ? normalizeEmail(c.leader_email) : "";
  const organizer = c.user_email ? normalizeEmail(c.user_email) : "";
  return leader !== "" && leader === organizer;
}

/** 
 * Max leader signup emails per event per hour. Default 1.
 * Note: Per-signup leader emails are now disabled entirely (PR #81 Oct 2026);
 * this constant remains for reference but is no longer used.
 */
export function leaderNotifyMaxPerHour(
  env: Record<string, string | undefined> = process.env,
): number {
  const n = Number(env.LEADER_NOTIFY_MAX_PER_HOUR);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/**
 * One minute buckets used as a sliding 5 minute dedupe window for magic
 * links. The first bucket (this minute) is the check. When it is free, a
 * send also marks the next 5 minutes, so any repeat request within 5 minutes
 * of a real send lands on an already used bucket.
 */
export function magicLinkDedupeBuckets(now: Date): Date[] {
  const minute = 60 * 1000;
  const start = Math.floor(now.getTime() / minute) * minute;
  return Array.from({ length: 6 }, (_, i) => new Date(start + i * minute));
}
