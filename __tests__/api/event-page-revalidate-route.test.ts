/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const mockRevalidate = jest.fn();
jest.mock("@/lib/event-page-cache", () => ({
  revalidateEventPage: (...a: unknown[]) => mockRevalidate(...a),
}));
const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ getAuthFromRequest: (...a: unknown[]) => mockAuth(...a) }));
const mockCanAdmin = jest.fn();
jest.mock("@/lib/campaign-access", () => ({ userCanAdminCampaign: (...a: unknown[]) => mockCanAdmin(...a) }));
let row: { organization_id: string | null } | null = null;
let lookupError: unknown = null;
jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: lookupError }) }) }),
    }),
  }),
}));

import { POST } from "@/app/api/events/[id]/revalidate/route";

const ID = "11111111-1111-4111-8111-111111111111";
const call = (id: string) =>
  POST(new NextRequest(`http://localhost/api/events/${id}/revalidate`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  mockRevalidate.mockReset();
  mockAuth.mockReset().mockResolvedValue({ ok: true, supabase: {}, user: { id: "u1" } });
  mockCanAdmin.mockReset().mockResolvedValue(true);
  row = { organization_id: "org-1" };
  lookupError = null;
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/events/[id]/revalidate", () => {
  it("expires the public page tag for an event admin", async () => {
    const res = await call(ID);
    expect(res.status).toBe(200);
    expect(mockRevalidate).toHaveBeenCalledWith(ID);
  });

  it("rejects a signed-out caller", async () => {
    mockAuth.mockResolvedValue({ ok: false, message: "Authorization token required", status: 401 });
    expect((await call(ID)).status).toBe(401);
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it("rejects someone who cannot edit the event", async () => {
    mockCanAdmin.mockResolvedValue(false);
    expect((await call(ID)).status).toBe(403);
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it("404s a bad or unknown id, and 500s a failed lookup, without expiring", async () => {
    expect((await call("not-a-uuid")).status).toBe(404);
    row = null;
    expect((await call(ID)).status).toBe(404);
    lookupError = { message: "timeout" };
    expect((await call(ID)).status).toBe(500);
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});
