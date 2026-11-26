/**
 * Tooltip content for the Weekly trends charts on the founder metrics page.
 * Pure so it can be unit tested; the chart component only lays it out.
 * Weeks are Phoenix Monday keys (YYYY-MM-DD), Monday to Sunday in America/Phoenix.
 */
import { formatWeekRange, phoenixWeekKey } from "@/lib/metrics-weeks";
import { TRACKING_GAP_NOTE, type GapStatus } from "@/lib/tracking-gaps";

export type TooltipValueKind = "count" | "rate";

export type TooltipSeries = {
  label: string;
  values: (number | null)[];
  kind?: TooltipValueKind;
  /** Optional per week detail shown after the value, e.g. "83 of 118". */
  details?: (string | null)[];
  /** Browser only series: weeks a tracking gap made missing or partial. */
  gaps?: (GapStatus | null)[];
};

export type ChartTooltipContent = {
  /** "Oct 13 to Oct 19" */
  range: string;
  /** True when the week is the current Phoenix week (still in progress). */
  inProgress: boolean;
  rows: { label: string; value: string }[];
  /** Set when a browser tracking gap touched this week. */
  note?: string;
};

/** True when `weekKey` is the Phoenix week containing `now`. */
export function isCurrentPhoenixWeek(weekKey: string, now: Date | string = new Date()): boolean {
  return phoenixWeekKey(now) === weekKey;
}

/** Exact value for a tooltip: "1,234", "70.3%", or "n/a" when missing. */
export function formatTooltipValue(v: number | null | undefined, kind: TooltipValueKind = "count"): string {
  if (v == null || !Number.isFinite(v)) return "n/a";
  if (kind === "rate") return `${v.toFixed(1)}%`;
  return Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export function buildChartTooltip(opts: {
  weeks: string[];
  index: number;
  series: TooltipSeries[];
  goal?: { value: number; kind?: TooltipValueKind };
  now?: Date | string;
  /** Per week: whether a browser tracking gap touched the week. */
  gapWeeks?: (GapStatus | null)[];
}): ChartTooltipContent {
  const week = opts.weeks[opts.index]!;
  const rows = opts.series.map((s) => {
    const gap = s.gaps?.[opts.index];
    if (gap === "missing") return { label: s.label, value: "no data" };
    const value = formatTooltipValue(s.values[opts.index], s.kind);
    const detail = s.details?.[opts.index] ?? (gap === "partial" && value !== "n/a" ? "partial" : null);
    return { label: s.label, value: detail && value !== "n/a" ? `${value} (${detail})` : value };
  });
  if (opts.goal) rows.push({ label: "Goal", value: formatTooltipValue(opts.goal.value, opts.goal.kind ?? "rate") });
  const out: ChartTooltipContent = {
    range: formatWeekRange(week),
    inProgress: isCurrentPhoenixWeek(week, opts.now),
    rows,
  };
  if (opts.gapWeeks?.[opts.index]) out.note = TRACKING_GAP_NOTE;
  return out;
}

/** One line for screen readers: "Oct 13 to Oct 19, in progress. New wards: 3. Total wards: 50." */
export function tooltipAriaLabel(t: ChartTooltipContent): string {
  const note = t.note ? ` ${t.note}.` : "";
  return `${t.range}${t.inProgress ? ", in progress" : ""}. ${t.rows.map((r) => `${r.label}: ${r.value}.`).join(" ")}${note}`;
}
