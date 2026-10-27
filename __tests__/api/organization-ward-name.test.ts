/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/organizations/[id]/route";
import { getAuthFromRequest } from "@/lib/auth";

jest.mock("@/lib/auth", () => ({ getAuthFromRequest: jest.fn() }));
const mockGetAuth = getAuthFromRequest as jest.MockedFunction<typeof getAuthFromRequest>;

const USER_ID = "owner-1";

function req(body: unknown) {
  return new NextRequest("http://wardsignup.com/api/organizations/org-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: "org-1" }) };

/** Fake client: lookup returns an owned org; each update result comes from `updateResults` in order. */
function client(updateResults: { data: unknown; error: unknown }[], ownerId = USER_ID) {
  const updates: Record<string, unknown>[] = [];
  const c = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: "org-1", owner_id: ownerId }, error: null }) }),
      }),
      update: (values: Record<string, unknown>) => {
        updates.push(values);
        const result = updateResults[updates.length - 1] ?? { data: null, error: { code: "X" } };
        return { eq: () => ({ select: () => ({ single: async () => result }) }) };
      },
    }),
  };
  mockGetAuth.mockResolvedValue({ ok: true, supabase: c, user: { id: USER_ID } } as never);
  return updates;
}

const okOrg = (extra: Record<string, unknown> = {}) => ({
  data: { id: "org-1", name: "Elders Quorum", needs_naming: false, brand_id: "wardsignup", ...extra },
  error: null,
});

describe("PATCH /api/organizations/[id] Ward/Unit", () => {
  beforeEach(() => jest.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it("leaves ward_name alone when it isn't sent (unchanged behavior)", async () => {
    const updates = client([okOrg()]);
    const res = await PATCH(req({ name: "Elders Quorum" }), params);
    expect(res.status).toBe(200);
    expect(updates).toEqual([{ name: "Elders Quorum", needs_naming: false }]);
    expect((await res.json()).wardSaved).toBeUndefined();
  });

  it("saves a trimmed ward_name with the name", async () => {
    const updates = client([okOrg({ ward_name: "Maple Ridge Ward" })]);
    const res = await PATCH(req({ name: "Elders Quorum", ward_name: "  Maple Ridge  Ward " }), params);
    expect(res.status).toBe(200);
    expect(updates[0]).toEqual({ name: "Elders Quorum", needs_naming: false, ward_name: "Maple Ridge Ward" });
    expect((await res.json()).wardSaved).toBe(true);
  });

  it("clears ward_name with an empty string", async () => {
    const updates = client([okOrg({ ward_name: null })]);
    await PATCH(req({ name: "Elders Quorum", ward_name: "" }), params);
    expect(updates[0]!.ward_name).toBeNull();
  });

  it("before the migration: saves the name anyway, no 5xx", async () => {
    const updates = client([
      { data: null, error: { code: "PGRST204", message: "Could not find the 'ward_name' column of 'organizations' in the schema cache" } },
      okOrg(),
    ]);
    const res = await PATCH(req({ name: "Elders Quorum", ward_name: "Maple Ridge Ward" }), params);
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(2);
    expect(updates[1]).toEqual({ name: "Elders Quorum", needs_naming: false });
    expect((await res.json()).wardSaved).toBe(false);
  });

  it("rejects non text and over long Ward/Unit", async () => {
    const updates = client([okOrg()]);
    expect((await PATCH(req({ name: "Elders Quorum", ward_name: 5 }), params)).status).toBe(400);
    expect((await PATCH(req({ name: "Elders Quorum", ward_name: "x".repeat(121) }), params)).status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it("only the owner can set Ward/Unit", async () => {
    const updates = client([okOrg()], "someone-else");
    expect((await PATCH(req({ name: "Elders Quorum", ward_name: "Maple Ridge Ward" }), params)).status).toBe(403);
    expect(updates).toHaveLength(0);
  });
});
