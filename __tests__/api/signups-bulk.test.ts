/**
 * @jest-environment node
 */

import { POST, maxDuration } from "@/app/api/signups/bulk/route";
import { NextRequest } from "next/server";
import { createSignupIfCapacityRpc } from "@/lib/supabase";
import { analyticsContextForCampaign } from "@/lib/analytics-context";

// Queue after() callbacks so tests can check what runs before vs after the response.
const afterQueue: Array<() => unknown> = [];
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  after: (cb: () => unknown) => void afterQueue.push(cb),
}));

jest.mock("@/lib/supabase", () => ({
  ...jest.requireActual("@/lib/supabase"),
  createSignupIfCapacityRpc: jest.fn(),
}));

jest.mock("@/lib/participant-email", () => ({
  sendParticipantBatchSignupConfirmation: jest.fn().mockResolvedValue({ ok: true }),
}));
jest.mock("@/lib/leader-email", () => ({
  sendLeaderSignupNotification: jest.fn().mockResolvedValue({ ok: true }),
}));

const mockCapture = jest.fn();
const mockFlush = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: mockCapture, flush: mockFlush }),
}));

jest.mock("@/lib/analytics-context", () => ({
  analyticsContextForCampaign: jest.fn(),
}));

// Minimal admin client: every query resolves empty unless a test overrides rpc.
const adminRpc = jest.fn();
const query = () => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "update"]) q[m] = () => q;
  q.single = () => Promise.resolve({ data: null, error: null });
  q.maybeSingle = q.single;
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
  return q;
};
jest.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => query(), rpc: (...a: unknown[]) => adminRpc(...a) }),
}));

const mockRpc = createSignupIfCapacityRpc as unknown as jest.Mock;
const mockOrgId = analyticsContextForCampaign as unknown as jest.Mock;

function bulkRequest(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost:3000/api/signups/bulk", {
    method: "POST",
    headers: { "x-posthog-distinct-id": "ph-1" },
    body: JSON.stringify({
      campaign_id: "camp-1",
      session_ids: ["s-1", "s-2"],
      member_name: "Jane",
      member_email: "jane@test.com",
      ...body,
    }),
  });
}

async function runAfter() {
  while (afterQueue.length) await afterQueue.shift()!();
}

describe("/api/signups/bulk", () => {
  const env = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    afterQueue.length = 0;
    process.env = { ...env, SUPABASE_SERVICE_ROLE_KEY: "svc", NEXT_PUBLIC_SUPABASE_URL: "http://sb" };
    adminRpc.mockResolvedValue({ data: true, error: null });
    mockRpc.mockImplementation(({ p_session_id }: { p_session_id: string }) =>
      Promise.resolve({ data: { id: `id-${p_session_id}`, cancel_token: `tok-${p_session_id}` }, error: null }),
    );
    mockOrgId.mockResolvedValue({ orgId: "11111111-1111-4111-8111-111111111111", isTestOrg: false });
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = env;
  });

  it("caps the function at about 30s", () => {
    expect(maxDuration).toBe(30);
  });

  it("returns before the org lookup and PostHog event, which run in after()", async () => {
    const response = await POST(bulkRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.primary_cancel_token).toBe("tok-s-1");
    expect(data.success_count).toBe(2);
    expect(mockOrgId).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();

    await runAfter();

    expect(mockOrgId).toHaveBeenCalledWith(expect.anything(), "camp-1");
    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "ph-1",
      event: "signup_batch_created",
      properties: {
        org_id: "11111111-1111-4111-8111-111111111111",
        is_test_org: false,
        campaign_id: "camp-1",
        event_id: "camp-1",
        slot_count: 2,
        success_count: 2,
        has_email: true,
        has_phone: false,
      },
    });
    expect(mockFlush).toHaveBeenCalled();
  });

  it("still sends the event with org_id null when the org lookup fails", async () => {
    mockOrgId.mockRejectedValue(new Error("boom"));
    await POST(bulkRequest());
    await runAfter();
    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({ properties: expect.objectContaining({ org_id: null, is_test_org: null }) }),
    );
  });

  it("returns a 503 JSON error when create_signup_if_capacity hangs", async () => {
    jest.useFakeTimers();
    mockRpc.mockReturnValue(new Promise(() => {}));

    const pending = POST(bulkRequest());
    await jest.advanceTimersByTimeAsync(10_000);
    const response = await pending;

    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/try again/i);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("returns a 503 JSON error when the rate limit RPC hangs", async () => {
    jest.useFakeTimers();
    adminRpc.mockReturnValue(new Promise(() => {}));

    const pending = POST(bulkRequest());
    await jest.advanceTimersByTimeAsync(10_000);
    const response = await pending;

    expect(response.status).toBe(503);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
