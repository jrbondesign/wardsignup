"use client";

import type { CoreMetric, CoreWeekly } from "@/lib/core-metrics";
import { TREND_ARROW, formatWeekRange, formatWeekStart, pctChange } from "@/lib/metrics-weeks";

const TREND_CLASS = { up: "text-[#1a9b6c]", down: "text-[#d0623b]", flat: "text-[#8a94a6]" } as const;
const TREND_WORD = { up: "up", down: "down", flat: "flat (within 3%)" } as const;
/** Product's reminder goal for email capture. */
export const EMAIL_CAPTURE_GOAL_PCT = 70;

function fmtValue(m: Pick<CoreMetric, "kind">, v: number | null | undefined): string {
  if (v == null) return "n/a";
  return m.kind === "rate" ? `${v.toFixed(1)}%` : v.toLocaleString();
}

function fmtChange(m: CoreMetric, cur: number | null, prev: number | null): string {
  if (cur == null || prev == null) return "n/a";
  const d = cur - prev;
  const sign = d >= 0 ? "+" : "";
  if (m.kind === "rate") return `${sign}${d.toFixed(1)} pts`;
  const p = pctChange(cur, prev);
  return `${sign}${d.toLocaleString()}${p == null ? "" : ` (${p >= 0 ? "+" : ""}${p.toFixed(0)}%)`}`;
}

function MiniBars({ values, weeks, metric }: { values: (number | null)[]; weeks: string[]; metric: CoreMetric }) {
  const w = 132;
  const h = 30;
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  const bw = w / values.length;
  return (
    <svg width={w} height={h} role="img" aria-label={`${metric.label}, last ${values.length} weeks`}>
      {values.map((v, i) => {
        const bh = v ? Math.max(2, ((h - 4) * v) / max) : 2;
        const fill = i === values.length - 1 ? "#0E96B0" : i === values.length - 2 ? "#9fd3de" : "#cfe8ee";
        return (
          <rect key={weeks[i]} x={i * bw + 2} y={h - bh} width={bw - 5} height={bh} rx={2} fill={fill}>
            <title>{`Week of ${formatWeekStart(weeks[i]!)}: ${fmtValue(metric, v)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** This week vs last week for the 10 core metrics, with a 6 week mini history. */
export function CoreMetricsStrip({ core }: { core: CoreWeekly }) {
  const n = core.weeks.length;
  const thisWeek = core.weeks[n - 1]!;
  const lastWeek = core.weeks[n - 2]!;
  const hist = core.weeks.slice(-6);
  return (
    <div
      className="bg-white rounded-2xl border border-[rgba(14,150,176,0.22)] shadow-[0_2px_12px_rgba(8,100,126,0.06)] p-6"
      data-testid="core-metrics-strip"
    >
      <div className="text-[12px] font-semibold text-[#08647E] uppercase tracking-[0.5px] mb-1">This week vs last week</div>
      <p className="text-[13px] text-[#5A8399] mb-4 max-w-3xl">
        This week ({formatWeekRange(thisWeek)}, so far) vs last week ({formatWeekRange(lastWeek)}), Monday to Sunday in Phoenix time.
        Team and test accounts are excluded. ▲ up · ▼ down · ▬ within 3%.
        {!core.posthogAvailable && " PostHog is unavailable right now, so visitor, signup, sheet and organizer counts show n/a."}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] border-b border-[rgba(14,150,176,0.10)]">
              <th className="text-left pb-2 pr-3 font-semibold">Metric</th>
              <th className="text-right pb-2 px-3 font-semibold">This week</th>
              <th className="text-right pb-2 px-3 font-semibold">Last week</th>
              <th className="text-right pb-2 px-3 font-semibold">Change</th>
              <th className="text-center pb-2 px-3 font-semibold">Trend</th>
              <th className="text-left pb-2 pl-3 font-semibold">Last 6 weeks</th>
            </tr>
          </thead>
          <tbody>
            {core.metrics.map((m) => {
              const cur = m.values[n - 1] ?? null;
              const prev = m.values[n - 2] ?? null;
              const histVals = m.values.slice(-6);
              return (
                <tr key={m.key} className="border-b border-[rgba(14,150,176,0.06)] last:border-0" data-testid={`core-row-${m.key}`}>
                  <td className="py-2 pr-3 font-semibold text-[#0D2B35]">{m.label}</td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    <span className="text-[16px] font-bold text-[#0D2B35]">{fmtValue(m, cur)}</span>
                    {m.details?.[n - 1] && <span className="block text-[11px] text-[#7A9BAE]">{m.details[n - 1]}</span>}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-[#5A8399]">
                    {fmtValue(m, prev)}
                    {m.details?.[n - 2] && <span className="block text-[11px] text-[#7A9BAE]">{m.details[n - 2]}</span>}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-[#2E5566] whitespace-nowrap">{fmtChange(m, cur, prev)}</td>
                  <td className={`py-2 px-3 text-center text-[17px] ${TREND_CLASS[m.trend]}`} title={TREND_WORD[m.trend]}>
                    <span aria-label={TREND_WORD[m.trend]}>{TREND_ARROW[m.trend]}</span>
                  </td>
                  <td className="py-2 pl-3">
                    <MiniBars values={histVals} weeks={hist} metric={m} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-[#7A9BAE] leading-relaxed">
        Signups count submissions (one per signup, even when several slots are picked). Active organizers signed in, created a sheet or shared one.
        Returning organizers were active this week and the week before. Email capture uses database signup rows, same as the card below.
        Visitors exclude only team members who are signed in.
      </p>
    </div>
  );
}

type ChartSeries = { values: (number | null)[]; color: string; kind: "bar" | "line"; label: string; axis?: "left" | "right" };

/** Small inline SVG weekly chart: bars and/or lines, optional goal line. */
export function WeeklyTrendChart({
  title,
  weeks,
  series,
  goal,
  unit = "",
  yMax,
  testId,
}: {
  title: string;
  weeks: string[];
  series: ChartSeries[];
  goal?: { value: number; label: string };
  unit?: string;
  /** Fixed left axis top (e.g. 100 for percentages). */
  yMax?: number;
  testId?: string;
}) {
  const W = 300;
  const H = 120;
  const pad = { l: 30, r: 30, t: 10, b: 20 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const left = series.filter((s) => (s.axis ?? "left") === "left");
  const right = series.filter((s) => s.axis === "right");
  const maxOf = (ss: ChartSeries[], extra = 0) => Math.max(1, extra, ...ss.flatMap((s) => s.values.map((v) => v ?? 0)));
  const maxL = yMax ?? maxOf(left, goal?.value ?? 0);
  const maxR = maxOf(right);
  const step = iw / weeks.length;
  const x = (i: number) => pad.l + i * step + step / 2;
  const y = (v: number, max: number) => pad.t + ih - (ih * v) / max;
  const fmt = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}${unit}`;
  return (
    <div className="bg-[#F9FCFD] rounded-xl border border-[rgba(14,150,176,0.12)] p-4" data-testid={testId}>
      <div className="text-[12px] font-semibold text-[#0D2B35] mb-1">{title}</div>
      <div className="flex flex-wrap gap-x-3 text-[11px] text-[#5A8399] mb-1">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        {goal && <span className="inline-flex items-center gap-1">┄ {goal.label}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={title}>
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke="#d5e6ec" />
        <text x={pad.l - 4} y={pad.t + 4} fontSize="9" textAnchor="end" fill="#7A9BAE">{fmt(maxL)}</text>
        <text x={pad.l - 4} y={pad.t + ih} fontSize="9" textAnchor="end" fill="#7A9BAE">0</text>
        {right.length > 0 && (
          <text x={W - pad.r + 4} y={pad.t + 4} fontSize="9" textAnchor="start" fill="#7A9BAE">{fmt(maxR)}</text>
        )}
        {series.map((s, si) => {
          const max = s.axis === "right" ? maxR : maxL;
          if (s.kind === "bar") {
            const bars = series.filter((t) => t.kind === "bar");
            const bi = bars.indexOf(s);
            const bw = (step * 0.7) / bars.length;
            return (
              <g key={si}>
                {s.values.map((v, i) =>
                  v == null ? null : (
                    <rect
                      key={i}
                      x={x(i) - (step * 0.7) / 2 + bi * bw}
                      y={y(v, max)}
                      width={Math.max(1, bw - 1)}
                      height={Math.max(0, pad.t + ih - y(v, max))}
                      rx={1.5}
                      fill={s.color}
                    >
                      <title>{`Week of ${formatWeekStart(weeks[i]!)}: ${fmt(v)}`}</title>
                    </rect>
                  ),
                )}
              </g>
            );
          }
          const pts = s.values
            .map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v, max).toFixed(1)}`))
            .filter(Boolean)
            .join(" ");
          return (
            <g key={si}>
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2} />
              {s.values.map((v, i) =>
                v == null ? null : (
                  <circle key={i} cx={x(i)} cy={y(v, max)} r={2.5} fill={s.color}>
                    <title>{`Week of ${formatWeekStart(weeks[i]!)}: ${fmt(v)}`}</title>
                  </circle>
                ),
              )}
            </g>
          );
        })}
        {goal && (
          <line
            x1={pad.l}
            x2={W - pad.r}
            y1={y(goal.value, maxL)}
            y2={y(goal.value, maxL)}
            stroke="#d0623b"
            strokeDasharray="4 3"
            strokeWidth={1.2}
          />
        )}
        {[0, weeks.length - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 6} fontSize="9" textAnchor="middle" fill="#7A9BAE">
            {formatWeekStart(weeks[i]!)}
          </text>
        ))}
      </svg>
    </div>
  );
}

/** Weekly trend charts for the core strip (Phoenix weeks, about 12 weeks). */
export function CoreTrendCharts({ core }: { core: CoreWeekly }) {
  const get = (k: CoreMetric["key"]) => core.metrics.find((m) => m.key === k)?.values ?? [];
  return (
    <div
      className="bg-white rounded-2xl border border-[rgba(14,150,176,0.14)] shadow-[0_2px_12px_rgba(8,100,126,0.06)] p-6"
      data-testid="core-trend-charts"
    >
      <div className="text-[12px] font-semibold text-[#5A8399] uppercase tracking-[0.5px] mb-1">Weekly trends</div>
      <p className="text-[13px] text-[#5A8399] mb-4 max-w-3xl">
        Last {core.weeks.length} weeks, Monday to Sunday in Phoenix time. The latest week is still in progress.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <WeeklyTrendChart
          testId="chart-signups"
          title="Signups (submissions)"
          weeks={core.weeks}
          series={[{ label: "Signups", values: get("slotSignups"), color: "#0E96B0", kind: "bar" }]}
        />
        <WeeklyTrendChart
          testId="chart-visitors"
          title="Unique visitors"
          weeks={core.weeks}
          series={[{ label: "Visitors", values: get("visitors"), color: "#5BB8CC", kind: "bar" }]}
        />
        <WeeklyTrendChart
          testId="chart-wards"
          title="New wards and total wards"
          weeks={core.weeks}
          series={[
            { label: "New wards (left)", values: get("newWards"), color: "#0E96B0", kind: "bar" },
            { label: "Total wards (right)", values: core.totalWards, color: "#08647E", kind: "line", axis: "right" },
          ]}
        />
        <WeeklyTrendChart
          testId="chart-email-capture"
          title="Email capture rate"
          weeks={core.weeks}
          unit="%"
          yMax={100}
          goal={{ value: EMAIL_CAPTURE_GOAL_PCT, label: `${EMAIL_CAPTURE_GOAL_PCT}% goal` }}
          series={[{ label: "Capture rate", values: get("emailCaptureRate"), color: "#0E96B0", kind: "line" }]}
        />
      </div>
    </div>
  );
}
