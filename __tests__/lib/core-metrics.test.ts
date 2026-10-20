import { describe, it, expect } from "@jest/globals";
import { buildCoreWeekly, lastWeekKeys, bucketByWeek } from "@/lib/core-metrics";
import { phoenixWeekKey } from "@/lib/metrics-weeks";
import { coreTeamFilterSql } from "@/lib/posthog-query";

const weeks = lastWeekKeys("2026-10-12", 3); // Sep 28, Oct 5, Oct 12

const counts = (n: number) => ({
  visitors: n * 10,
  slotSignups: n * 2,
  peopleSigningUp: n,
  itemSignups: n,
  sheetsCreated: n,
  activeOrganizers: n,
});

describe("weekly series builder", () => {
  it("lists Phoenix weeks oldest first ending this week", () => {
    expect(weeks).toEqual(["2026-09-28", "2026-10-05", "2026-10-12"]);
    expect(lastWeekKeys("2026-10-12", 12)[0]).toBe("2026-07-27");
  });

  it("buckets instants into Phoenix weeks", () => {
    const b = bucketByWeek(
      ["2026-10-19T00:30:00Z", "2026-10-12T07:00:00Z", "2026-10-12T06:00:00Z"],
      phoenixWeekKey,
    );
    expect(b).toEqual({ "2026-10-12": 2, "2026-10-05": 1 });
  });

  it("builds all 10 metrics with trends, cumulative total wards and returning organizers", () => {
    const core = buildCoreWeekly({
      weeks,
      posthog: {
        weeks: { "2026-09-28": counts(5), "2026-10-05": counts(10), "2026-10-12": counts(10.2) },
        organizersByWeek: {
          "2026-09-21": ["a"],
          "2026-09-28": ["a", "b"],
          "2026-10-05": ["b", "c", "d"],
          "2026-10-12": ["c", "d", "e"],
        },
      },
      newCreatorsByWeek: { "2026-10-05": 4, "2026-10-12": 8 },
      newWardsByWeek: { "2026-09-28": 2, "2026-10-12": 6, "2026-01-05": 99 },
      wardsBeforeFirstWeek: 30,
      emailCaptureByWeek: {
        "2026-10-05": { total: 96, withEmail: 67, ratePct: 69.8 },
        "2026-10-12": { total: 118, withEmail: 83, ratePct: 70.3 },
      },
    });
    expect(core.metrics.map((m) => m.key)).toEqual([
      "visitors",
      "slotSignups",
      "peopleSigningUp",
      "itemSignups",
      "sheetsCreated",
      "newCreators",
      "newWards",
      "activeOrganizers",
      "emailCaptureRate",
      "returningOrganizers",
    ]);
    const by = Object.fromEntries(core.metrics.map((m) => [m.key, m]));
    expect(by.visitors!.values).toEqual([50, 100, 102]);
    expect(by.visitors!.trend).toBe("flat"); // +2%
    expect(by.newCreators!.values).toEqual([0, 4, 8]);
    expect(by.newCreators!.trend).toBe("up");
    expect(by.newWards!.values).toEqual([2, 0, 6]);
    expect(core.totalWards).toEqual([32, 32, 38]);
    expect(by.emailCaptureRate!.values).toEqual([null, 69.8, 70.3]);
    expect(by.emailCaptureRate!.details).toEqual([null, "67 of 96", "83 of 118"]);
    expect(by.emailCaptureRate!.trend).toBe("flat");
    expect(by.emailCaptureRate!.label).toBe("Email capture rate");
    // returning: Sep 28 {a,b}∩{a}=1; Oct 5 {b,c,d}∩{a,b}=1; Oct 12 {c,d,e}∩{b,c,d}=2
    expect(by.returningOrganizers!.values).toEqual([1, 1, 2]);
    expect(by.returningOrganizers!.details![2]).toBe("of 3 active the week before");
    expect(by.returningOrganizers!.trend).toBe("up");
    expect(by.slotSignups!.label).toBe("Signups (submissions)");
    expect(core.posthogAvailable).toBe(true);
  });

  it("fills zeros for weeks PostHog returned nothing for", () => {
    const core = buildCoreWeekly({
      weeks,
      posthog: { weeks: { "2026-10-12": counts(1) }, organizersByWeek: {} },
      newCreatorsByWeek: {},
      newWardsByWeek: {},
      wardsBeforeFirstWeek: 0,
      emailCaptureByWeek: {},
    });
    expect(core.metrics[0]!.values).toEqual([0, 0, 10]);
    expect(core.metrics[0]!.trend).toBe("up");
  });

  it("shows n/a (null) for PostHog metrics when PostHog is down, keeps database metrics", () => {
    const core = buildCoreWeekly({
      weeks,
      posthog: null,
      newCreatorsByWeek: { "2026-10-12": 1 },
      newWardsByWeek: {},
      wardsBeforeFirstWeek: 5,
      emailCaptureByWeek: {},
    });
    const by = Object.fromEntries(core.metrics.map((m) => [m.key, m]));
    expect(by.visitors!.values).toEqual([null, null, null]);
    expect(by.visitors!.trend).toBe("flat");
    expect(by.returningOrganizers!.values).toEqual([null, null, null]);
    expect(by.newCreators!.values).toEqual([0, 0, 1]);
    expect(core.totalWards).toEqual([5, 5, 5]);
    expect(core.posthogAvailable).toBe(false);
  });
});

describe("PostHog team filter", () => {
  it("only lets UUIDs and plain emails into the query", () => {
    const sql = coreTeamFilterSql(
      ["09af30ba-6faf-4fd0-8a04-100bb7a52564", "x'); drop table events; --"],
      ["helper@example.com", "bad' or 1=1@x.com"],
    );
    expect(sql).toContain("'09af30ba-6faf-4fd0-8a04-100bb7a52564'");
    expect(sql).not.toContain("drop table");
    expect(sql).toContain("'helper@example.com'");
    expect(sql).not.toContain("1=1");
    expect(sql).toContain("properties.campaign_id");
    expect(sql).toContain("properties.event_id");
  });
});
