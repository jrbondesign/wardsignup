/**
 * @jest-environment node
 */

import { GET, PATCH } from "@/app/api/organizer-profile/calling/route";
import { NextRequest } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureOrganizerBrandMatchesHost } from "@/lib/organizer-profile";

jest.mock("@/lib/auth", () => ({ getAuthFromRequest: jest.fn() }));
jest.mock("@/lib/organizer-profile", () => ({ ensureOrganizerBrandMatchesHost: jest.fn() }));

const mockGetAuth = getAuthFromRequest as jest.MockedFunction<typeof getAuthFromRequest>;
const mockEnsure = ensureOrganizerBrandMatchesHost as jest.MockedFunction<typeof ensureOrganizerBrandMatchesHost>;

const USER_ID = "user-1";

function req(method: "GET" | "PATCH", body?: unknown) {
  return new NextRequest("http://wardsignup.com/api/organizer-profile/calling", {
    method,
    headers: { "Content-Type": "application/json", host: "wardsignup.com" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function supabaseWith({
  selectResult = { data: null, error: null },
  updateError = null,
}: { selectResult?: { data: unknown; error: unknown }; updateError?: unknown } = {}) {
  const updates: unknown[] = [];
  const eqFilters: [string, unknown][] = [];
  type Chain = { eq: jest.Mock; [k: string]: unknown };
  const selectChain: Chain = {
    eq: jest.fn((col: string, val: unknown): Chain => {
      eqFilters.push([col, val]);
      return selectChain;
    }),
    maybeSingle: jest.fn(() => Promise.resolve(selectResult)),
  };
  const updateChain: Chain = {
    eq: jest.fn((col: string, val: unknown): Chain => {
      eqFilters.push([col, val]);
      return updateChain;
    }),
    then: (resolve: (v: unknown) => void) => resolve({ error: updateError }),
  };
  const client = {
    from: jest.fn(() => ({
      select: jest.fn(() => selectChain),
      update: jest.fn((payload: unknown) => {
        updates.push(payload);
        return updateChain;
      }),
    })),
  };
  return { client, updates, eqFilters };
}

function signIn(client: unknown) {
  mockGetAuth.mockResolvedValue({
    ok: true,
    supabase: client as never,
    user: { id: USER_ID } as never,
  });
}

describe("/api/organizer-profile/calling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsure.mockResolvedValue({ ok: true, brandId: "wardsignup" });
  });

  it("requires sign in", async () => {
    mockGetAuth.mockResolvedValue({ ok: false, message: "Authorization token required", status: 401 });
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await PATCH(req("PATCH", { calling: "Bishop" }))).status).toBe(401);
  });

  it("GET returns the caller's own calling for this brand", async () => {
    const { client, eqFilters } = supabaseWith({ selectResult: { data: { calling: "Bishop" }, error: null } });
    signIn(client);
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ calling: "Bishop" });
    expect(eqFilters).toEqual([
      ["user_id", USER_ID],
      ["brand_id", "wardsignup"],
    ]);
  });

  it("GET degrades to null before the migration runs", async () => {
    const { client } = supabaseWith({ selectResult: { data: null, error: { code: "42703" } } });
    signIn(client);
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ calling: null });
  });

  it("PATCH saves normalized free text on the caller's own row", async () => {
    const { client, updates, eqFilters } = supabaseWith();
    signIn(client);
    const res = await PATCH(req("PATCH", { calling: "  Stake   clerk " }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ calling: "Stake clerk" });
    expect(updates[0]).toMatchObject({ calling: "Stake clerk" });
    expect(eqFilters).toEqual([
      ["user_id", USER_ID],
      ["brand_id", "wardsignup"],
    ]);
    expect(mockEnsure).toHaveBeenCalled();
  });

  it("PATCH clears the calling with null or blank", async () => {
    const { client, updates } = supabaseWith();
    signIn(client);
    const res = await PATCH(req("PATCH", { calling: "   " }));
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ calling: null });
  });

  it("PATCH rejects non text and over long values", async () => {
    const { client, updates } = supabaseWith();
    signIn(client);
    expect((await PATCH(req("PATCH", { calling: 5 }))).status).toBe(400);
    expect((await PATCH(req("PATCH", { calling: "x".repeat(81) }))).status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it("PATCH returns 503 before the migration runs", async () => {
    const { client } = supabaseWith({ updateError: { code: "42703" } });
    signIn(client);
    expect((await PATCH(req("PATCH", { calling: "Bishop" }))).status).toBe(503);
  });
});
