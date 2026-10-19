import { describe, it, expect } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import { CoreMetricsStrip, CoreTrendCharts } from "@/components/metrics/CoreMetricsStrip";
import { buildCoreWeekly, lastWeekKeys } from "@/lib/core-metrics";

const weeks = lastWeekKeys("2026-10-12", 12);
const core = buildCoreWeekly({
  weeks,
  posthog: {
    weeks: Object.fromEntries(
      weeks.map((w, i) => [
        w,
        { visitors: 300 + i, slotSignups: 50 + i * 5, peopleSigningUp: 40, itemSignups: 5, sheetsCreated: 6, activeOrganizers: 12 },
      ]),
    ),
    organizersByWeek: {},
  },
  newCreatorsByWeek: { "2026-10-12": 8, "2026-10-05": 4 },
  newWardsByWeek: { "2026-10-12": 6, "2026-10-05": 4 },
  wardsBeforeFirstWeek: 30,
  emailCaptureByWeek: {
    "2026-10-05": { total: 96, withEmail: 67, ratePct: 69.8 },
    "2026-10-12": { total: 118, withEmail: 83, ratePct: 70.3 },
  },
});

describe("core metrics strip", () => {
  it("renders 10 rows with this week, last week and arrows", () => {
    render(<CoreMetricsStrip core={core} />);
    expect(screen.getByText("This week vs last week")).toBeTruthy();
    expect(screen.getAllByTestId(/^core-row-/)).toHaveLength(10);
    const ec = screen.getByTestId("core-row-emailCaptureRate");
    expect(ec.textContent).toContain("70.3%");
    expect(ec.textContent).toContain("83 of 118");
    expect(ec.textContent).toContain("+0.5 pts");
    expect(ec.textContent).toContain("▬");
    expect(screen.getByTestId("core-row-newCreators").textContent).toContain("▲");
  });

  it("renders the four trend charts with a 70% goal on email capture", () => {
    render(<CoreTrendCharts core={core} />);
    for (const id of ["chart-signups", "chart-visitors", "chart-wards", "chart-email-capture"]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.getByTestId("chart-email-capture").textContent).toContain("70% goal");
    expect(screen.getByTestId("chart-wards").textContent).toContain("Total wards");
  });

  it("new copy has no em or en dashes", () => {
    const { container } = render(
      <>
        <CoreMetricsStrip core={core} />
        <CoreTrendCharts core={core} />
      </>,
    );
    expect(container.textContent).not.toMatch(/[–—]/);
  });
});

describe("metrics page keeps existing sections", () => {
  const src = readFileSync(path.join(process.cwd(), "app/admin/metrics/page.tsx"), "utf8");
  it("still has the email capture card, map, funnel, activation, accounts, creators and weekly history", () => {
    for (const s of [
      'data-testid="email-capture-card"',
      "<GeographyMap />",
      "Weekly history since launch",
      ">Funnel<",
      ">Activation<",
      ">Accounts<",
      ">Creators<",
      "Recent Signups",
      "New wards",
    ]) {
      expect(src).toContain(s);
    }
  });
  it("uses Phoenix weeks, the UTC month label fix and the Signed in rename", () => {
    expect(src).not.toContain("Weeks are UTC");
    expect(src).toContain("Phoenix time");
    expect(src).not.toContain('new Date(row.month + "-01")');
    expect(src).toContain("formatMonthLabel(row.month)");
    expect(src).toContain("Signed in (1d)");
    expect(src).not.toContain("Active (30d)");
  });
});
