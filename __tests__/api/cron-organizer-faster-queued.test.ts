/**
 * @jest-environment node
 */
jest.mock("@/lib/supabase-admin", () => ({ createServiceRoleClient: jest.fn() }));
jest.mock("@/lib/organizer-email", () => ({ sendOrganizerFasterAlertEmail: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({
  claimCronRun: jest.fn().mockResolvedValue({ claimed: true }),
  hourBucketDate: () => new Date("2026-11-08T18:00:00.000Z"),
}));
jest.mock("@/lib/cron-brand", () => ({ resolveCronBrandId: () => "wardsignup" }));
jest.mock("@/lib/email-outbound", () => ({ emailCronDisabledBody: () => null }));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/organizer-faster/route";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { sendOrganizerFasterAlertEmail } from "@/lib/organizer-email";

beforeEach(() => {
  process.env.CRON_SECRET = "cron-secret";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  (createServiceRoleClient as jest.Mock).mockReturnValue({
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.then = (resolve: (value: unknown) => unknown) =>
        resolve({ data: [{ id: "c1", organizer_instant_notify_enabled: true }], error: null });
      return chain;
    },
  });
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

function call() {
  return GET(new NextRequest("https://wardsignup.com/api/cron/organizer-faster", {
    headers: { authorization: "Bearer cron-secret" },
  }));
}

it("does not count a queued faster alert as sent", async () => {
  (sendOrganizerFasterAlertEmail as jest.Mock).mockResolvedValue({
    ok: false,
    error: "Brevo rate limited",
    retryable: true,
    queued: true,
    sentTo: "owner@example.com",
  });
  const body = await (await call()).json();
  expect(body.sent).toBe(0);
  expect(body.queued).toBe(1);
  expect(body.errors).toBeUndefined();
});
