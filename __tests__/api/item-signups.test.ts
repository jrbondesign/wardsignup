/**
 * @jest-environment node
 */

import { POST } from "@/app/api/item-signups/route";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { clearSignupIdempotencyMemory } from "@/lib/signup-idempotency";

const mockRpc = jest.fn();

function withAbort(value: unknown) {
  const p = Promise.resolve(value);
  const q: { abortSignal: () => unknown; then: typeof p.then } = {
    abortSignal: () => q,
    then: p.then.bind(p),
  };
  return q;
}
function emptyFrom() {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "abortSignal"]) q[m] = () => q;
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
  return q;
}
const mockFrom = jest.fn(emptyFrom);
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    rpc: (...args: unknown[]) => withAbort(mockRpc(...args)),
    from: () => mockFrom(),
  })),
}));

jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return { ...actual, after: (fn: () => unknown) => { void fn(); } };
});

jest.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: jest.fn() }),
  captureServerException: jest.fn(),
}));

describe("/api/item-signups", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    clearSignupIdempotencyMemory();
    mockFrom.mockImplementation(emptyFrom);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    mockRpc.mockImplementation((name: string) => {
      if (name === "try_consume_signup_rate") {
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({
        data: { id: "is-1", campaign_id: "c1", member_name: "Pat", quantity: 1 },
        error: null,
      });
    });
  });

  it("creates an item signup through the capacity RPC", async () => {
    const request = new NextRequest("http://localhost:3000/api/item-signups", {
      method: "POST",
      body: JSON.stringify({
        campaign_id: "c1",
        item_id: "item-1",
        member_name: "Pat",
        quantity: 2,
      }),
    });
    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.signup.member_name).toBe("Pat");
    expect(mockRpc).toHaveBeenCalledWith(
      "create_item_signup_if_capacity",
      expect.objectContaining({
        p_campaign_id: "c1",
        p_item_id: "item-1",
        p_member_name: "Pat",
        p_quantity: 2,
      }),
    );
    expect(createClient).toHaveBeenCalled();
  });

  it("maps ITEM_FULL to 409", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "try_consume_signup_rate") {
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: { message: "ITEM_FULL" } });
    });
    const request = new NextRequest("http://localhost:3000/api/item-signups", {
      method: "POST",
      body: JSON.stringify({
        campaign_id: "c1",
        item_id: "item-1",
        member_name: "Pat",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(409);
  });

  it("returns 503 when the service role is missing", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const request = new NextRequest("http://localhost:3000/api/item-signups", {
      method: "POST",
      body: JSON.stringify({
        campaign_id: "c1",
        item_id: "item-1",
        member_name: "Pat",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(503);
  });

  it("returns a cached signup on retry without hitting the rate-limit RPC", async () => {
    const key = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const first = await POST(new NextRequest("http://localhost:3000/api/item-signups", {
      method: "POST",
      body: JSON.stringify({
        campaign_id: "c1",
        item_id: "item-1",
        member_name: "Pat",
        member_email: "pat@test.com",
        idempotency_key: key,
      }),
    }));
    expect(first.status).toBe(200);
    const rateCalls = mockRpc.mock.calls.filter((c) => c[0] === "try_consume_signup_rate").length;
    expect(rateCalls).toBe(1);

    mockRpc.mockImplementation(() => new Promise(() => {}));
    const second = await POST(new NextRequest("http://localhost:3000/api/item-signups", {
      method: "POST",
      body: JSON.stringify({
        campaign_id: "c1",
        item_id: "item-1",
        member_name: "Pat",
        member_email: "pat@test.com",
        idempotency_key: key,
        signup_retry: true,
      }),
    }));
    expect(second.status).toBe(200);
    expect((await second.json()).signup.member_name).toBe("Pat");
    expect(mockRpc).toHaveBeenCalledTimes(rateCalls + 1); // first request: rate + create only
  });

  it("does not insert when a retry's email lookup times out", async () => {
    jest.useFakeTimers();
    mockFrom.mockImplementation(() => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "abortSignal"]) q[m] = () => q;
      q.then = () => new Promise(() => {});
      return q;
    });

    const pending = POST(new NextRequest("http://localhost:3000/api/item-signups", {
      method: "POST",
      body: JSON.stringify({
        campaign_id: "c1",
        item_id: "item-1",
        member_name: "Pat",
        member_email: "pat@test.com",
        signup_retry: true,
      }),
    }));
    await jest.advanceTimersByTimeAsync(10_000);
    const response = await pending;
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/try again/i);
    expect(mockRpc.mock.calls.some((c) => c[0] === "create_item_signup_if_capacity")).toBe(false);
  });

  it("reuses a recent no-email signup with the same name on retry instead of inserting", async () => {
    const existing = {
      id: "is-existing",
      item_id: "item-1",
      custom_label: null,
      member_email: null,
      member_name: "Alex Reed",
      quantity: 1,
      signed_up_at: new Date().toISOString(),
    };
    mockFrom.mockImplementation(() => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "abortSignal"]) q[m] = () => q;
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [existing], error: null }).then(res);
      return q;
    });

    const response = await POST(new NextRequest("http://localhost:3000/api/item-signups", {
      method: "POST",
      body: JSON.stringify({
        campaign_id: "c1",
        item_id: "item-1",
        member_name: "Alex Reed",
        quantity: 1,
        signup_retry: true,
      }),
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).signup.id).toBe("is-existing");
    expect(mockRpc.mock.calls.some((c) => c[0] === "create_item_signup_if_capacity")).toBe(false);
  });

  it("continues to create the signup when the rate-limit RPC times out", async () => {
    jest.useFakeTimers();
    mockRpc.mockImplementation((name: string) => {
      if (name === "try_consume_signup_rate") return new Promise(() => {});
      return Promise.resolve({
        data: { id: "is-after-rate-timeout", campaign_id: "c1", member_name: "Pat", quantity: 1 },
        error: null,
      });
    });

    const pending = POST(new NextRequest("http://localhost:3000/api/item-signups", {
      method: "POST",
      body: JSON.stringify({
        campaign_id: "c1",
        item_id: "item-1",
        member_name: "Pat",
      }),
    }));
    await jest.advanceTimersByTimeAsync(10_000);
    const response = await pending;
    expect(response.status).toBe(200);
    expect((await response.json()).signup.id).toBe("is-after-rate-timeout");
    expect(mockRpc.mock.calls.some((c) => c[0] === "create_item_signup_if_capacity")).toBe(true);
  });
});
