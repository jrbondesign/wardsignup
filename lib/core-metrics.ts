/**
 * Builds the "This week vs last week" core strip and its weekly trend series
 * for the founder metrics page. Pure: the API route gathers the inputs.
 * Weeks are Phoenix Monday keys (YYYY-MM-DD), oldest first; the last one is this week.
 */
import { addWeeks, trendDirection, type Trend } from "@/lib/metrics-weeks";
import type { CoreWeekCounts } from "@/lib/posthog-query";
import { weekGapStatuses, type GapStatus } from "@/lib/tracking-gaps";

export type CoreMetricKey =
  | "visitors"
  | "slotSignups"
  | "peopleSigningUp"
  | "itemSignups"
  | "sheetsCreated"
  | "newCreators"
  | "newWards"
  | "activeOrganizers"
  | "emailCaptureRate"
  | "returningOrganizers";

export type CoreMetric = {
  key: CoreMetricKey;
  label: string;
  kind: "count" | "rate";
  /** One value per week (null when the source was unavailable or there was no base). */
  values: (number | null)[];
  /** Optional per week detail, e.g. "83 of 118". */
  details?: (string | null)[];
  /** This week vs last week. */
  trend: Trend;
  /**
   * Browser only metrics: per week "missing" or "partial" when browser
   * tracking was down (value is null when missing). Absent for metrics with a
   * server or database source.
   */
  gap?: (GapStatus | null)[];
};

export type CoreWeekly = {
  weeks: string[];
  metrics: CoreMetric[];
  /** Total wards (all time, cumulative) at the end of each week. */
  totalWards: number[];
  /** False when PostHog was unreachable, so the PostHog metrics are null. */
  posthogAvailable: boolean;
  /** Per week: did a browser tracking gap touch it (see lib/tracking-gaps). */
  gapWeeks: (GapStatus | null)[];
};

/** Metrics that only browser events can measure. */
const BROWSER_ONLY: ReadonlySet<CoreMetricKey> = new Set(["visitors", "activeOrganizers", "returningOrganizers"]);

export const CORE_METRIC_LABELS: Record<CoreMetricKey, string> = {
  visitors: "Unique visitors",
  slotSignups: "Signups (submissions)",
  peopleSigningUp: "People signing up",
  itemSignups: "Item signups",
  sheetsCreated: "Sheets created",
  newCreators: "New creators",
  newWards: "New wards",
  activeOrganizers: "Active organizers",
  emailCaptureRate: "Email capture rate",
  returningOrganizers: "Returning organizers",
};

/** Phoenix week keys ending with `currentWeek`, `count` long, oldest first. */
export function lastWeekKeys(currentWeek: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(addWeeks(currentWeek, -i));
  return out;
}

/** Count of instants per Phoenix week key, using the given key function. */
export function bucketByWeek(dates: Iterable<string>, toKey: (iso: string) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of dates) {
    const k = toKey(d);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export function buildCoreWeekly(input: {
  weeks: string[];
  /** null when PostHog is unavailable. */
  posthog: {
    weeks: Record<string, CoreWeekCounts>;
    organizersByWeek: Record<string, string[]>;
  } | null;
  newCreatorsByWeek: Record<string, number>;
  newWardsByWeek: Record<string, number>;
  /** Wards whose first published sheet is before the first week. */
  wardsBeforeFirstWeek: number;
  emailCaptureByWeek: Record<string, { total: number; withEmail: number; ratePct: number | null }>;
  /** Defaults to the weeks touched by BROWSER_TRACKING_GAPS. */
  gapWeeks?: (GapStatus | null)[];
}): CoreWeekly {
  const { weeks, posthog } = input;
  const gapWeeks = input.gapWeeks ?? weekGapStatuses(weeks);
  const ph = (pick: Exclude<keyof CoreWeekCounts, "server">) =>
    weeks.map((w) => (posthog ? posthog.weeks[w]?.[pick] ?? 0 : null));
  // Signups have a server event too; weeks touched by a browser gap use it.
  const serverWeek = (i: number) => (gapWeeks[i] ? posthog?.weeks[weeks[i]!]?.server ?? null : null);
  const signupSeries = (pick: "slotSignups" | "peopleSigningUp" | "itemSignups") => {
    const values = ph(pick).map((v, i) => serverWeek(i)?.[pick] ?? v);
    const details = weeks.map((_, i) => (serverWeek(i) ? "from server events" : null));
    return details.some(Boolean) ? { values, details } : { values };
  };

  const returning: (number | null)[] = [];
  const returningDetails: (string | null)[] = [];
  for (const w of weeks) {
    if (!posthog) {
      returning.push(null);
      returningDetails.push(null);
      continue;
    }
    const prev = new Set(posthog.organizersByWeek[addWeeks(w, -1)] ?? []);
    const cur = new Set(posthog.organizersByWeek[w] ?? []);
    let n = 0;
    for (const p of cur) if (prev.has(p)) n += 1;
    returning.push(n);
    returningDetails.push(`of ${prev.size} active the week before`);
  }

  const capture = weeks.map((w) => input.emailCaptureByWeek[w] ?? null);

  const totalWards: number[] = [];
  let running = input.wardsBeforeFirstWeek;
  for (const w of weeks) {
    running += input.newWardsByWeek[w] ?? 0;
    totalWards.push(running);
  }

  const raw: Omit<CoreMetric, "trend" | "label">[] = [
    { key: "visitors", kind: "count", values: ph("visitors") },
    { key: "slotSignups", kind: "count", ...signupSeries("slotSignups") },
    { key: "peopleSigningUp", kind: "count", ...signupSeries("peopleSigningUp") },
    { key: "itemSignups", kind: "count", ...signupSeries("itemSignups") },
    { key: "sheetsCreated", kind: "count", values: ph("sheetsCreated") },
    { key: "newCreators", kind: "count", values: weeks.map((w) => input.newCreatorsByWeek[w] ?? 0) },
    { key: "newWards", kind: "count", values: weeks.map((w) => input.newWardsByWeek[w] ?? 0) },
    { key: "activeOrganizers", kind: "count", values: ph("activeOrganizers") },
    {
      key: "emailCaptureRate",
      kind: "rate",
      values: capture.map((c) => c?.ratePct ?? null),
      details: capture.map((c) => (c ? `${c.withEmail} of ${c.total}` : null)),
    },
    { key: "returningOrganizers", kind: "count", values: returning, details: returningDetails },
  ];

  const anyGap = gapWeeks.some(Boolean);
  const metrics: CoreMetric[] = raw.map((m) => {
    const n = m.values.length;
    if (!anyGap || !BROWSER_ONLY.has(m.key)) {
      return { ...m, label: CORE_METRIC_LABELS[m.key], trend: trendDirection(m.values[n - 1], m.values[n - 2]) };
    }
    // Browser only: a fully missing week has no value (never a real zero), and
    // a partial week is not compared, so the dip does not read as a drop.
    const values = m.values.map((v, i) => (gapWeeks[i] === "missing" ? null : v));
    const affected = Boolean(gapWeeks[n - 1] || gapWeeks[n - 2]);
    return {
      ...m,
      values,
      gap: gapWeeks,
      label: CORE_METRIC_LABELS[m.key],
      trend: affected ? "flat" : trendDirection(values[n - 1], values[n - 2]),
    };
  });

  return { weeks, metrics, totalWards, posthogAvailable: posthog !== null, gapWeeks };
}
