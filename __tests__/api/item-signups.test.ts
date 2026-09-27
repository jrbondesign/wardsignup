/**
 * @jest-environment node
 */

import { POST } from "@/app/api/item-signups/route";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const mockRpc = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: jest.fn(),
  })),
}));

jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return { ...actual, after: (fn: () => unknown) => { void fn(); } };
});

jest.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: jest.fn() }),
}));

describe("/api/item-signups", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
