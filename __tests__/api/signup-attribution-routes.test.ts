/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const mockRpc = jest.fn();
const mockIn = jest.fn(() => Promise.resolve({ error: null }));
const mockUpdate = jest.fn(() => ({ in: mockIn }));
const mockFrom = jest.fn((table: string) => {
  void table;
  return {
    update: mockUpdate,
    select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
  };
});

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({ rpc: (...a: unknown[]) => mockRpc(...a), from: (t: string) => mockFrom(t) })),
}));
jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return { ...actual, after: () => {} };
});
jest.mock("@/lib/posthog-server", () => ({ getPostHogClient: () => ({ capture: jest.fn() }) }));
const mockCreateSignup = jest.fn();
jest.mock("@/lib/supabase", () => ({ createSignupIfCapacityRpc: (...a: unknown[]) => mockCreateSignup(...a) }));

import { POST as itemPOST } from "@/app/api/item-signups/route";
import { POST as bulkPOST } from "@/app/api/signups/bulk/route";

const ATTR = { first_touch_utm_source: "participant_email", first_touch_utm_medium: "email", first_touch_ref: "share" };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  mockRpc.mockImplementation((name: string) =>
    name === "try_consume_signup_rate"
      ? Promise.resolve({ data: true, error: null })
      : Promise.resolve({ data: { id: "is-1", member_name: "Pat", quantity: 1 }, error: null }),
  );
});

it("item signups save first-touch attribution on the new row", async () => {
  const res = await itemPOST(
    new NextRequest("http://localhost/api/item-signups", {
      method: "POST",
      body: JSON.stringify({ campaign_id: "c1", item_id: "i1", member_name: "Pat", quantity: 1, ...ATTR }),
    }),
  );
  expect(res.status).toBe(200);
  expect(mockFrom).toHaveBeenCalledWith("item_signups");
  expect(mockUpdate).toHaveBeenCalledWith(ATTR);
  expect(mockIn).toHaveBeenCalledWith("id", ["is-1"]);
});

it("item signups still succeed when the attribution save fails (migration not applied)", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockIn.mockImplementationOnce(() => Promise.resolve({ error: { message: 'column "first_touch_ref" does not exist' } }));
  const res = await itemPOST(
    new NextRequest("http://localhost/api/item-signups", {
      method: "POST",
      body: JSON.stringify({ campaign_id: "c1", item_id: "i1", member_name: "Pat", quantity: 1, ...ATTR }),
    }),
  );
  expect(res.status).toBe(200);
});

it("multi-slot signups save attribution on every successful slot", async () => {
  mockCreateSignup
    .mockResolvedValueOnce({ data: { id: "s-1", cancel_token: "t1" }, error: null })
    .mockResolvedValueOnce({ data: null, error: { message: "SESSION_FULL" } })
    .mockResolvedValueOnce({ data: { id: "s-3", cancel_token: "t3" }, error: null });
  const res = await bulkPOST(
    new Request("http://localhost/api/signups/bulk", {
      method: "POST",
      body: JSON.stringify({ campaign_id: "c1", session_ids: ["a", "b", "c"], member_name: "Pat", ...ATTR }),
    }),
  );
  expect(res.status).toBe(200);
  expect(mockFrom).toHaveBeenCalledWith("signups");
  expect(mockUpdate).toHaveBeenCalledWith(ATTR);
  expect(mockIn).toHaveBeenCalledWith("id", ["s-1", "s-3"]);
});

it("no attribution in the body means no extra update", async () => {
  mockCreateSignup.mockResolvedValueOnce({ data: { id: "s-1", cancel_token: "t1" }, error: null });
  await bulkPOST(
    new Request("http://localhost/api/signups/bulk", {
      method: "POST",
      body: JSON.stringify({ campaign_id: "c1", session_ids: ["a"], member_name: "Pat" }),
    }),
  );
  expect(mockUpdate).not.toHaveBeenCalled();
});
