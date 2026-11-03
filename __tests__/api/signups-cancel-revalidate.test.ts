/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

const mockRevalidate = jest.fn();
jest.mock("@/lib/event-page-cache", () => ({
  revalidateEventPage: (...a: unknown[]) => mockRevalidate(...a),
}));
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  after: (cb: () => unknown) => void cb(),
}));
jest.mock("@/lib/rate-limit", () => ({ consumeActionRate: async () => ({ allowed: true }) }));
jest.mock("@/lib/gcal-feature", () => ({ isGcalSyncFeatureEnabled: () => false }));
jest.mock("@/lib/google-calendar-sync", () => ({ syncCampaignCalendar: jest.fn() }));

let found: { id: string; member_name: string; campaign_id: string } | null = null;
let deleteError: unknown = null;
jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: found, error: null }) }) }),
      delete: () => ({ eq: async () => ({ error: deleteError }) }),
    }),
  }),
}));

import { POST } from "@/app/api/signups/cancel/route";

const req = (token: string) =>
  new NextRequest("http://localhost/api/signups/cancel", { method: "POST", body: JSON.stringify({ token }) });

beforeEach(() => {
  mockRevalidate.mockReset();
  found = { id: "s1", member_name: "A", campaign_id: "camp-1" };
  deleteError = null;
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/signups/cancel event page cache", () => {
  it("expires the event page cache after a cancel", async () => {
    const res = await POST(req("tok"));
    expect(res.status).toBe(200);
    expect(mockRevalidate).toHaveBeenCalledWith("camp-1");
  });

  it("does not expire it when nothing was cancelled", async () => {
    found = null;
    expect((await POST(req("tok"))).status).toBe(404);
    deleteError = { message: "boom" };
    found = { id: "s1", member_name: "A", campaign_id: "camp-1" };
    expect((await POST(req("tok"))).status).toBe(500);
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});
