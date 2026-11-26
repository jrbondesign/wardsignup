/**
 * Windows when browser PostHog events were not stored, so browser only metrics
 * (visitors, signed in activity) undercount those weeks. Server events and
 * database rows were not affected.
 *
 * To record another outage, add an entry. Times are UTC instants.
 */
import { MS_WEEK, phoenixWeekKeyToUtc } from "@/lib/metrics-weeks";

export type TrackingGap = { startIso: string; endIso: string };

export const BROWSER_TRACKING_GAPS: readonly TrackingGap[] = [
  // PR 174 redacted the project token on every browser event; PR 178 fixed it.
  // 8:58 PM MST Nov 22 2026 to 8:46 AM MST Nov 26 2026.
  { startIso: "2026-11-23T03:58:00Z", endIso: "2026-11-26T15:46:00Z" },
];

/** Shown next to every week a gap touches. */
export const TRACKING_GAP_NOTE = "Browser tracking was down, no data stored";

/**
 * PostHog distinct ids to leave out of every metric (manual checks, not real
 * visitors). The first is the Nov 26 2026 tracking fix check pageview.
 */
export const EXCLUDED_DISTINCT_IDS: readonly string[] = ["01a2188d-847d-7d5e-9896-3e00468e4b4e"];

/** "missing" when a gap covers the whole Phoenix week, "partial" when it covers part of it. */
export type GapStatus = "missing" | "partial";

export function weekGapStatus(
  weekKey: string,
  gaps: readonly TrackingGap[] = BROWSER_TRACKING_GAPS,
): GapStatus | null {
  const start = phoenixWeekKeyToUtc(weekKey).getTime();
  const end = start + MS_WEEK;
  let covered = 0;
  for (const g of gaps) {
    const s = Math.max(start, Date.parse(g.startIso));
    const e = Math.min(end, Date.parse(g.endIso));
    if (e > s) covered += e - s;
  }
  if (covered <= 0) return null;
  return covered >= end - start ? "missing" : "partial";
}

/** Gap status for each week key. */
export function weekGapStatuses(weeks: string[], gaps: readonly TrackingGap[] = BROWSER_TRACKING_GAPS): (GapStatus | null)[] {
  return weeks.map((w) => weekGapStatus(w, gaps));
}

/** "Nov 22, 8:58 PM to Nov 26, 8:46 AM (Phoenix time)" for the note. */
export function formatGapWindow(g: TrackingGap): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Phoenix",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  return `${fmt(g.startIso)} to ${fmt(g.endIso)} (Phoenix time)`;
}

/** HogQL clause that drops the excluded distinct ids. */
export function excludedDistinctIdsSql(ids: readonly string[] = EXCLUDED_DISTINCT_IDS): string {
  const safe = ids.filter((id) => /^[A-Za-z0-9_\-]+$/.test(id)).map((id) => `'${id}'`);
  return safe.length ? `distinct_id not in (${safe.join(",")})` : "1 = 1";
}
