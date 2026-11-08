/**
 * @jest-environment node
 */
jest.mock("@/lib/auth", () => ({ getAuthFromRequest: jest.fn() }));
jest.mock("@/lib/campaign-access", () => ({ userCanAdminCampaign: jest.fn().mockResolvedValue(true) }));
jest.mock("@/lib/campaign-brand-guard", () => ({ campaignMatchesHostBrand: () => true }));
jest.mock("@/lib/email-send", () => ({
  consumeEmailKeyRate: jest.fn().mockResolvedValue(true),
  consumeEmailKeyRateCount: jest.fn().mockResolvedValue(1),
}));
jest.mock("@/lib/supabase-admin", () => ({ createServiceRoleClient: () => ({}) }));
jest.mock("@/lib/organizer-email", () => ({ sendOrganizerMetricsEmail: jest.fn() }));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/events/[id]/organizer-report/route";
import { getAuthFromRequest } from "@/lib/auth";
import { sendOrganizerMetricsEmail } from "@/lib/organizer-email";
import { organizerReportResultMessage } from "@/lib/organizer-report-ui";

const EVENT = "11111111-2222-4333-8444-555555555555";

function req() {
  return new NextRequest(`https://wardsignup.com/api/events/${EVENT}/organizer-report`, {
    method: "POST",
    headers: { host: "wardsignup.com" },
  });
}

beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  process.env.EMAIL_PROVIDER_CUTOVER = "brevo";
  (getAuthFromRequest as jest.Mock).mockResolvedValue({
    ok: true,
    user: { id: "owner" },
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: EVENT, brand_id: "wardsignup" }, error: null }),
          }),
        }),
      }),
    },
  });
  (sendOrganizerMetricsEmail as jest.Mock).mockReset();
});

afterEach(() => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.EMAIL_PROVIDER_CUTOVER;
});

it("says queued when the report was parked, and sent only when a provider accepted it", async () => {
  (sendOrganizerMetricsEmail as jest.Mock).mockResolvedValueOnce({
    ok: false,
    error: "Brevo rate limited",
    retryable: true,
    queued: true,
    sentTo: "owner@example.com",
  });
  const queued = await POST(req(), { params: Promise.resolve({ id: EVENT }) });
  expect(queued.status).toBe(202);
  const queuedBody = await queued.json();
  expect(queuedBody).toEqual({ ok: true, delivery: "queued", sentTo: "owner@example.com" });
  expect(organizerReportResultMessage(queuedBody)).toBe(
    "Report queued for owner@example.com. It has not been sent yet.",
  );

  (sendOrganizerMetricsEmail as jest.Mock).mockResolvedValueOnce({ ok: true, sentTo: "owner@example.com" });
  const sent = await POST(req(), { params: Promise.resolve({ id: EVENT }) });
  expect(sent.status).toBe(200);
  const sentBody = await sent.json();
  expect(sentBody.delivery).toBe("sent");
  expect(organizerReportResultMessage(sentBody)).toContain("Report sent to owner@example.com");
});
