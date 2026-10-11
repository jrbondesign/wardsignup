import {
  fasterAlertMinHours,
  isFasterAlertThrottled,
  leaderCoveredByOrganizerAlerts,
  leaderNotifyMaxPerHour,
  magicLinkDedupeBuckets,
  normalizeEmail,
} from "@/lib/email-throttle";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Ky@Example.COM ")).toBe("ky@example.com");
  });
});

describe("faster alert throttle", () => {
  const now = new Date("2026-10-11T20:00:00Z");
  it("defaults to 3 hours and reads the env override", () => {
    expect(fasterAlertMinHours({})).toBe(3);
    expect(fasterAlertMinHours({ ORGANIZER_FASTER_ALERT_MIN_HOURS: "6" })).toBe(6);
    expect(fasterAlertMinHours({ ORGANIZER_FASTER_ALERT_MIN_HOURS: "nope" })).toBe(3);
  });
  it("throttles inside the window and allows after it", () => {
    expect(isFasterAlertThrottled("2026-10-11T18:30:00Z", now, 3)).toBe(true);
    expect(isFasterAlertThrottled("2026-10-11T16:59:00Z", now, 3)).toBe(false);
    expect(isFasterAlertThrottled(null, now, 3)).toBe(false);
    expect(isFasterAlertThrottled("garbage", now, 3)).toBe(false);
  });
});

describe("leader coverage", () => {
  it("is covered only when faster alerts are on and the leader is the organizer", () => {
    expect(
      leaderCoveredByOrganizerAlerts({
        organizer_instant_notify_enabled: true,
        leader_email: " Lead@X.com",
        user_email: "lead@x.com",
      }),
    ).toBe(true);
    expect(
      leaderCoveredByOrganizerAlerts({
        organizer_instant_notify_enabled: false,
        leader_email: "lead@x.com",
        user_email: "lead@x.com",
      }),
    ).toBe(false);
    expect(
      leaderCoveredByOrganizerAlerts({
        organizer_instant_notify_enabled: true,
        leader_email: "lead@x.com",
        user_email: "org@x.com",
      }),
    ).toBe(false);
  });
  it("caps leader mail at 1 per hour by default", () => {
    expect(leaderNotifyMaxPerHour({})).toBe(1);
    expect(leaderNotifyMaxPerHour({ LEADER_NOTIFY_MAX_PER_HOUR: "4" })).toBe(4);
  });
});

describe("magicLinkDedupeBuckets", () => {
  it("returns this minute plus the next 5, so repeats within 5 minutes collide", () => {
    const first = magicLinkDedupeBuckets(new Date("2026-10-11T15:09:27Z")).map((d) => d.toISOString());
    expect(first[0]).toBe("2026-10-11T15:09:00.000Z");
    expect(first).toHaveLength(6);
    // A second click 81 seconds later checks a bucket the first send marked.
    const second = magicLinkDedupeBuckets(new Date("2026-10-11T15:10:48Z"))[0].toISOString();
    expect(first).toContain(second);
    // Six minutes later is a fresh window.
    const later = magicLinkDedupeBuckets(new Date("2026-10-11T15:15:30Z"))[0].toISOString();
    expect(first).not.toContain(later);
  });
});
