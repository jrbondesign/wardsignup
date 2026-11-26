import { describe, it, expect } from "@jest/globals";
import {
  BROWSER_TRACKING_GAPS,
  EXCLUDED_DISTINCT_IDS,
  TRACKING_GAP_NOTE,
  excludedDistinctIdsSql,
  formatGapWindow,
  weekGapStatus,
} from "@/lib/tracking-gaps";
import { buildCoreWeekly, lastWeekKeys } from "@/lib/core-metrics";
import { coreTeamFilterSql } from "@/lib/posthog-query";

describe("browser tracking gaps", () => {
  it("records the Nov 22 to Nov 26 2026 outage", () => {
    expect(BROWSER_TRACKING_GAPS[0]).toEqual({ startIso: "2026-11-23T03:58:00Z", endIso: "2026-11-26T15:46:00Z" });
    expect(TRACKING_GAP_NOTE).toBe("Browser tracking was down, no data stored");
    expect(formatGapWindow(BROWSER_TRACKING_GAPS[0]!).replace(/\s/g, " ")).toBe(
      "Nov 22, 8:58 PM to Nov 26, 8:46 AM (Phoenix time)",
    );
  });

  it("marks both straddled Phoenix weeks partial and leaves others alone", () => {
    expect(weekGapStatus("2026-11-09")).toBeNull();
    expect(weekGapStatus("2026-11-16")).toBe("partial"); // Nov 16 to Nov 22, last 3 hours
    expect(weekGapStatus("2026-11-23")).toBe("partial"); // Nov 23 to Nov 29, through Thursday morning
    expect(weekGapStatus("2026-11-30")).toBeNull();
  });

  it("marks a week missing when a gap covers all of it", () => {
    const gaps = [{ startIso: "2026-11-01T00:00:00Z", endIso: "2026-11-20T00:00:00Z" }];
    expect(weekGapStatus("2026-11-09", gaps)).toBe("missing");
    expect(weekGapStatus("2026-11-16", gaps)).toBe("partial");
  });

  it("drops the tracking fix check pageview from every PostHog metric query", () => {
    expect(EXCLUDED_DISTINCT_IDS).toContain("01a2188d-847d-7d5e-9896-3e00468e4b4e");
    expect(excludedDistinctIdsSql()).toBe("distinct_id not in ('01a2188d-847d-7d5e-9896-3e00468e4b4e')");
    expect(excludedDistinctIdsSql(["x'); drop"])).toBe("1 = 1");
    expect(coreTeamFilterSql([], [])).toContain("distinct_id not in ('01a2188d-847d-7d5e-9896-3e00468e4b4e')");
  });
});

describe("core weekly series across the gap", () => {
  const weeks = lastWeekKeys("2026-11-23", 3); // Nov 9, Nov 16, Nov 23
  const week = (v: number, slot: number, server: number) => ({
    visitors: v,
    slotSignups: slot,
    peopleSigningUp: slot,
    itemSignups: 1,
    sheetsCreated: 6,
    activeOrganizers: 4,
    server: { slotSignups: server, peopleSigningUp: server - 1, itemSignups: 2 },
  });
  const core = buildCoreWeekly({
    weeks,
    posthog: {
      weeks: { "2026-11-09": week(509, 112, 113), "2026-11-16": week(530, 147, 149), "2026-11-23": week(4, 0, 12) },
      organizersByWeek: {},
    },
    newCreatorsByWeek: {},
    newWardsByWeek: { "2026-11-23": 1 },
    wardsBeforeFirstWeek: 10,
    emailCaptureByWeek: {},
  });
  const by = Object.fromEntries(core.metrics.map((m) => [m.key, m]));

  it("uses server signup events for the affected weeks only", () => {
    expect(core.gapWeeks).toEqual([null, "partial", "partial"]);
    expect(by.slotSignups!.values).toEqual([112, 149, 12]);
    expect(by.peopleSigningUp!.values).toEqual([112, 148, 11]);
    expect(by.itemSignups!.values).toEqual([1, 2, 2]);
    expect(by.slotSignups!.details).toEqual([null, "from server events", "from server events"]);
    expect(by.slotSignups!.gap).toBeUndefined();
    expect(by.sheetsCreated!.gap).toBeUndefined();
    expect(by.newWards!.gap).toBeUndefined();
  });

  it("flags browser only metrics partial and does not compare them", () => {
    expect(by.visitors!.values).toEqual([509, 530, 4]);
    expect(by.visitors!.gap).toEqual([null, "partial", "partial"]);
    expect(by.visitors!.trend).toBe("flat");
    expect(by.activeOrganizers!.gap).toEqual([null, "partial", "partial"]);
    expect(by.returningOrganizers!.gap).toEqual([null, "partial", "partial"]);
  });

  it("shows a fully missing browser week as no value, never zero", () => {
    const c = buildCoreWeekly({
      weeks,
      posthog: { weeks: { "2026-11-16": week(0, 0, 149) }, organizersByWeek: {} },
      newCreatorsByWeek: {},
      newWardsByWeek: {},
      wardsBeforeFirstWeek: 0,
      emailCaptureByWeek: {},
      gapWeeks: [null, "missing", null],
    });
    const visitors = c.metrics.find((m) => m.key === "visitors")!;
    expect(visitors.values).toEqual([0, null, 0]);
    expect(c.metrics.find((m) => m.key === "slotSignups")!.values[1]).toBe(149);
  });
});
