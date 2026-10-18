/**
 * Weekly signup email capture rate for the founder metrics page:
 * signups with a non empty member_email divided by all signups, bucketed into
 * Monday to Sunday weeks in America/Phoenix (UTC-7, no DST).
 */

const PHOENIX_OFFSET_MS = -7 * 60 * 60 * 1000;
const MS_DAY = 24 * 60 * 60 * 1000;

export type CaptureSignupRow = { signed_up_at: string; member_email: string | null };

export type EmailCaptureWeek = {
  /** Phoenix Monday, YYYY-MM-DD. */
  weekStart: string;
  total: number;
  withEmail: number;
  /** withEmail / total as a percentage with one decimal, null when total is 0. */
  ratePct: number | null;
};

export type EmailCaptureRate = {
  thisWeek: EmailCaptureWeek;
  /** Most recent completed weeks, oldest first. */
  completedWeeks: EmailCaptureWeek[];
};

/** UTC instant of Phoenix midnight on the Monday of the week containing `at`. */
export function phoenixWeekStartUtc(at: Date): Date {
  const local = new Date(at.getTime() + PHOENIX_OFFSET_MS);
  const day = local.getUTCDay();
  const sinceMonday = day === 0 ? 6 : day - 1;
  local.setUTCDate(local.getUTCDate() - sinceMonday);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - PHOENIX_OFFSET_MS);
}

function weekKey(startUtc: Date): string {
  return new Date(startUtc.getTime() + PHOENIX_OFFSET_MS).toISOString().slice(0, 10);
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
    ratePct: total === 0 ? null : Math.round((1000 * withEmail) / total) / 10,
  }));
  return { thisWeek: weeks[weeks.length - 1]!, completedWeeks: weeks.slice(0, -1) };
}
