/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const claimCronRun = jest.fn().mockResolvedValue({ claimed: false });
jest.mock("@/lib/rate-limit", () => ({
  ...jest.requireActual("@/lib/rate-limit"),
  claimCronRun: (...a: unknown[]) => claimCronRun(...a),
}));
jest.mock("@/lib/supabase-admin", () => ({ createServiceRoleClient: () => ({}) }));
jest.mock("@/lib/feedback-ask-pause", () => ({ isFeedbackAskPaused: () => false }));

import { GET } from "@/app/api/cron/organizer-digest/route";
import { runFeedbackAskPass } from "@/lib/feedback-ask";
import vercel from "../../vercel.json";

const saved = { ...process.env };
beforeEach(() => {
  claimCronRun.mockClear();
  process.env = { ...saved, CRON_SECRET: "s", SUPABASE_SERVICE_ROLE_KEY: "k" };
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());
afterAll(() => {
  process.env = saved;
});

const bucketFor = (job: string) => (claimCronRun.mock.calls.find((c) => String(c[0]).startsWith(job))?.[1] as Date).toISOString();

it("organizer digest and feedback ask claim the Arizona day", async () => {
  // 5:05 AM Arizona Oct 19
  jest.setSystemTime(new Date("2026-10-19T12:05:00Z"));
  const res = await GET(new NextRequest("https://wardsignup.com/api/cron/organizer-digest", { headers: { authorization: "Bearer s" } }));
  expect((await res.json()).skipped).toBe("already_ran_today");
  expect(bucketFor("organizer-digest:")).toBe("2026-10-19T07:00:00.000Z");
  expect(bucketFor("feedback-ask:")).toBe("2026-10-19T07:00:00.000Z");
});

it("a 6 PM Arizona ping is still the same Arizona day, though it's the next UTC day", async () => {
  jest.setSystemTime(new Date("2026-10-20T01:00:00Z"));
  await runFeedbackAskPass({} as never, "wardsignup");
  expect(bucketFor("feedback-ask:")).toBe("2026-10-19T07:00:00.000Z");
});

it("11:59 PM and 12:00 AM Arizona are different days", async () => {
  jest.setSystemTime(new Date("2026-10-20T06:59:00Z"));
  await runFeedbackAskPass({} as never, "wardsignup");
  jest.setSystemTime(new Date("2026-10-20T07:00:00Z"));
  await runFeedbackAskPass({} as never, "wardsignup");
  const buckets = claimCronRun.mock.calls.map((c) => (c[1] as Date).toISOString());
  expect(buckets).toEqual(["2026-10-19T07:00:00.000Z", "2026-10-20T07:00:00.000Z"]);
});

it("vercel.json: digest at 5:05 AM Arizona, queue drain hourly at :07 (includes 12:07 AM Arizona)", () => {
  const byPath = Object.fromEntries((vercel as { crons: { path: string; schedule: string }[] }).crons.map((c) => [c.path, c.schedule]));
  expect(byPath["/api/cron/organizer-digest"]).toBe("5 12 * * *");
  expect(byPath["/api/cron/email-queue"]).toBe("7 * * * *");
});
