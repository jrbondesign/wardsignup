import { describe, it, expect } from "@jest/globals";
import { render, screen, fireEvent, act } from "@testing-library/react";
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

describe("weekly trend chart tooltips", () => {
  // Thursday Oct 15, 2026, 10 AM Phoenix: the week of Oct 12 is in progress.
  const now = "2026-10-15T17:00:00Z";
  const last = weeks.length - 1;

  it("hover shows the Phoenix week range and exact value; leaving hides it", () => {
    render(<CoreTrendCharts core={core} now={now} />);
    const hit = screen.getByTestId("chart-signups-hit-3");
    fireEvent.mouseEnter(hit);
    const tip = screen.getByTestId("chart-signups-tooltip");
    expect(tip.getAttribute("role")).toBe("tooltip");
    expect(tip.textContent).toContain("Aug 17 to Aug 23");
    expect(tip.textContent).toContain("Signups");
    expect(tip.textContent).toContain("65");
    expect(tip.textContent).not.toContain("in progress");
    fireEvent.mouseLeave(hit.parentElement!.parentElement!);
    expect(screen.queryByTestId("chart-signups-tooltip")).toBeNull();
  });

  it("wards tooltip shows new wards and the running total, current week in progress", () => {
    render(<CoreTrendCharts core={core} now={now} />);
    fireEvent.click(screen.getByTestId(`chart-wards-hit-${last}`));
    const tip = screen.getByTestId("chart-wards-tooltip");
    expect(tip.textContent).toContain("Oct 12 to Oct 18");
    expect(tip.textContent).toContain("in progress");
    expect(tip.textContent).toContain("New wards6");
    expect(tip.textContent).toContain("Total wards40");
  });

  it("capture rate tooltip shows the rate and the 70% goal", () => {
    render(<CoreTrendCharts core={core} now={now} />);
    fireEvent.click(screen.getByTestId(`chart-email-capture-hit-${last - 1}`));
    const tip = screen.getByTestId("chart-email-capture-tooltip");
    expect(tip.textContent).toContain("Oct 5 to Oct 11");
    expect(tip.textContent).toContain("69.8% (67 of 96)");
    expect(tip.textContent).toContain("Goal70.0%");
  });

  it("tap shows it, tap elsewhere hides it", () => {
    render(
      <div>
        <button data-testid="elsewhere">x</button>
        <CoreTrendCharts core={core} now={now} />
      </div>,
    );
    fireEvent.click(screen.getByTestId("chart-visitors-hit-2"));
    expect(screen.getByTestId("chart-visitors-tooltip")).toBeTruthy();
    act(() => {
      screen.getByTestId("elsewhere").dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(screen.queryByTestId("chart-visitors-tooltip")).toBeNull();
  });

  it("keyboard focus shows it, Escape and blur hide it, with accessible labels", () => {
    render(<CoreTrendCharts core={core} now={now} />);
    const hit = screen.getByTestId(`chart-wards-hit-${last}`);
    expect(hit.getAttribute("tabindex")).toBe("0");
    expect(hit.getAttribute("aria-label")).toBe("Oct 12 to Oct 18, in progress. New wards: 6. Total wards: 40.");
    fireEvent.focus(hit);
    const tip = screen.getByTestId("chart-wards-tooltip");
    expect(hit.getAttribute("aria-describedby")).toBe(tip.id);
    fireEvent.keyDown(hit, { key: "Escape" });
    expect(screen.queryByTestId("chart-wards-tooltip")).toBeNull();
    fireEvent.focus(hit);
    fireEvent.blur(hit);
    expect(screen.queryByTestId("chart-wards-tooltip")).toBeNull();
  });

  it("tooltip copy has no dashes", () => {
    const { container } = render(<CoreTrendCharts core={core} now={now} />);
    for (const id of ["chart-signups", "chart-visitors", "chart-wards", "chart-email-capture"]) {
      fireEvent.click(screen.getByTestId(`${id}-hit-${last}`));
    }
    expect(container.textContent).not.toMatch(/[–—]/);
    for (const el of container.querySelectorAll("[aria-label]")) {
      expect(el.getAttribute("aria-label")).not.toMatch(/[–—-]/);
    }
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
