/**
 * @jest-environment node
 */

const mockAnalyticsContext = jest.fn();
jest.mock("@/lib/supabase-admin", () => ({ createServiceRoleClient: () => ({}) }));
jest.mock("@/lib/analytics-context", () => ({
  analyticsContextForCampaign: (...args: unknown[]) => mockAnalyticsContext(...args),
}));

import { GET } from "@/app/api/events/[id]/analytics-context/route";
import { NextRequest } from "next/server";

const CAMPAIGN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ORG = "11111111-2222-4333-8444-555555555555";

async function call(id: string) {
  const res = await GET(new NextRequest(`http://localhost/api/events/${id}/analytics-context`), {
    params: Promise.resolve({ id }),
  });
  return res.json();
}

describe("GET /api/events/[id]/analytics-context", () => {
  beforeEach(() => mockAnalyticsContext.mockReset());

  it("returns only the org id and a boolean is_test_org", async () => {
    mockAnalyticsContext.mockResolvedValue({ orgId: ORG, isTestOrg: true });
    const body = await call(CAMPAIGN);
    expect(body).toEqual({ orgId: ORG, isTestOrg: true });
    expect(JSON.stringify(body)).not.toContain("@");
  });

  it("returns nulls when the lookup throws", async () => {
    mockAnalyticsContext.mockRejectedValue(new Error("db down"));
    await expect(call(CAMPAIGN)).resolves.toEqual({ orgId: null, isTestOrg: null });
  });

  it("returns nulls for a non-uuid id without a lookup", async () => {
    await expect(call("nope")).resolves.toEqual({ orgId: null, isTestOrg: null });
    expect(mockAnalyticsContext).not.toHaveBeenCalled();
  });
});
