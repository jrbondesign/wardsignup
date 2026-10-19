/**
 * @jest-environment node
 */
const mockClaim = jest.fn();
jest.mock("@/lib/rate-limit", () => ({ claimCronRun: (...a: unknown[]) => mockClaim(...a) }));
jest.mock("@/lib/geography-cache", () => ({
  refreshGeographyCacheFromPostHog: jest.fn().mockResolvedValue({ refreshed: false, reason: "test" }),
}));

import { GET } from "@/app/api/cron/geography-refresh/route";
import { NextRequest } from "next/server";

const req = () =>
  new NextRequest("http://localhost/api/cron/geography-refresh", {
    headers: { authorization: "Bearer s3cret" },
  });

describe("geography-refresh once per Phoenix day", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    mockClaim.mockReset().mockResolvedValue({ claimed: false, reason: "already_claimed_today" });
  });
  afterEach(() => jest.useRealTimers());

  it.each([
    // [now (UTC), expected bucket = Phoenix midnight]
    ["2026-10-18T15:00:00Z", "2026-10-18T07:00:00.000Z"], // 8 AM Phoenix (the cron time)
    ["2026-10-19T00:30:00Z", "2026-10-18T07:00:00.000Z"], // 5:30 PM Sunday Phoenix: same Phoenix day, new UTC day
    ["2026-10-19T06:59:59Z", "2026-10-18T07:00:00.000Z"], // 11:59:59 PM Phoenix
    ["2026-10-19T07:00:00Z", "2026-10-19T07:00:00.000Z"], // midnight Phoenix: new day
  ])("at %s claims bucket %s", async (now, bucket) => {
    jest.useFakeTimers({ now: new Date(now), doNotFake: ["nextTick", "setImmediate"] });
    await GET(req());
    expect(mockClaim).toHaveBeenCalledWith("geography-refresh", new Date(bucket));
  });
});
