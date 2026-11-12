/**
 * @jest-environment node
 *
 * Server side of the "Let people add their own items" switch: the item signup
 * route turns the RPC's CUSTOM_ITEMS_DISABLED into a friendly 403, listed items
 * still work, and the event PATCH saves the flag (with a clear message on a
 * database that has not run the migration yet).
 */
import { NextRequest } from "next/server";
import { POST } from "@/app/api/item-signups/route";
import { PATCH } from "@/app/api/events/[id]/route";
import { clearSignupIdempotencyMemory } from "@/lib/signup-idempotency";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAdminCampaign } from "@/lib/campaign-access";
import { CUSTOM_ITEMS_DISABLED_MESSAGE } from "@/lib/public-event-page";

const mockRpc = jest.fn();
function withAbort(value: unknown) {
  const p = Promise.resolve(value);
  const q: { abortSignal: () => unknown; then: typeof p.then } = { abortSignal: () => q, then: p.then.bind(p) };
  return q;
}
function emptyFrom() {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "abortSignal", "single", "maybeSingle"]) q[m] = () => q;
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
  return q;
}
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    rpc: (...args: unknown[]) => withAbort(mockRpc(...args)),
    from: () => emptyFrom(),
  })),
}));
jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return { ...actual, after: () => {} };
});
jest.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: jest.fn() }),
  captureServerException: jest.fn(),
}));
jest.mock("@/lib/event-page-cache", () => ({ ...jest.requireActual("@/lib/event-page-cache"), revalidateEventPage: jest.fn() }));
jest.mock("@/lib/auth", () => ({ getAuthFromRequest: jest.fn() }));
jest.mock("@/lib/campaign-access", () => ({ userCanAdminCampaign: jest.fn(), userCanDeleteCampaign: jest.fn() }));

const mockGetAuth = getAuthFromRequest as jest.MockedFunction<typeof getAuthFromRequest>;
const mockCanAdmin = userCanAdminCampaign as jest.MockedFunction<typeof userCanAdminCampaign>;

function itemSignupRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/item-signups", {
    method: "POST",
    body: JSON.stringify({ campaign_id: "c1", member_name: "Pat", ...body }),
  });
}

/** RPC fake that behaves like the migrated function for one campaign flag. */
function rpcFor(allowCustomItems: boolean | undefined) {
  return (name: string, args: Record<string, unknown>) => {
    if (name === "try_consume_signup_rate") return Promise.resolve({ data: true, error: null });
    if (args.p_custom_label && allowCustomItems === false) {
      return Promise.resolve({ data: null, error: { message: "CUSTOM_ITEMS_DISABLED", details: null, hint: null } });
    }
    return Promise.resolve({ data: { id: "is-1", campaign_id: "c1", member_name: "Pat", quantity: 1 }, error: null });
  };
}

describe("POST /api/item-signups with the write-in switch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearSignupIdempotencyMemory();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  });

  it("rejects a write-in with a friendly 403 when the organizer turned it off", async () => {
    mockRpc.mockImplementation(rpcFor(false));
    const res = await POST(itemSignupRequest({ custom_label: "A generator" }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe(CUSTOM_ITEMS_DISABLED_MESSAGE);
    expect(data.custom_items_disabled).toBe(true);
    expect(JSON.stringify(data)).not.toMatch(/CUSTOM_ITEMS_DISABLED"/);
  });

  it("still signs up for a listed item when write-ins are off", async () => {
    mockRpc.mockImplementation(rpcFor(false));
    const res = await POST(itemSignupRequest({ item_id: "item-1" }));
    expect(res.status).toBe(200);
    expect((await res.json()).signup.id).toBe("is-1");
  });

  it.each([true, undefined])("allows a write-in when the switch is %p (on, or pre-migration)", async (flag) => {
    mockRpc.mockImplementation(rpcFor(flag));
    const res = await POST(itemSignupRequest({ custom_label: "A generator" }));
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith(
      "create_item_signup_if_capacity",
      expect.objectContaining({ p_custom_label: "A generator", p_item_id: null }),
    );
  });
});

describe("PATCH /api/events/[id] allow_custom_items", () => {
  const EVENT_ID = "44444444-4444-4444-4444-444444444444";

  function authWithUpdateResult(result: { data: unknown; error: unknown }) {
    const update = jest.fn(() => ({
      eq: jest.fn(() => ({ select: jest.fn(() => ({ single: jest.fn(() => Promise.resolve(result)) })) })),
    }));
    mockGetAuth.mockResolvedValue({
      ok: true,
      user: { id: "admin-user" } as never,
      supabase: {
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(() =>
                Promise.resolve({
                  data: { id: EVENT_ID, brand_id: "wardsignup", organization_id: "org-1", name: "Potluck", event_type: "items" },
                  error: null,
                }),
              ),
            })),
          })),
          update,
        })),
      } as never,
    });
    return update;
  }

  function patch(body: Record<string, unknown>) {
    return PATCH(
      new NextRequest(`http://localhost/api/events/${EVENT_ID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: EVENT_ID }) },
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockCanAdmin.mockResolvedValue(true);
  });

  it("saves the switch as a boolean", async () => {
    const update = authWithUpdateResult({ data: { id: EVENT_ID, allow_custom_items: false }, error: null });
    const res = await patch({ allow_custom_items: false });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ allow_custom_items: false });
  });

  it("says the setting is not available yet when the column is missing", async () => {
    authWithUpdateResult({ data: null, error: { code: "PGRST204", message: "Could not find the 'allow_custom_items' column" } });
    const res = await patch({ allow_custom_items: false });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/isn't available yet/);
  });
});
