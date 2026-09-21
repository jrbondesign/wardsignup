/**
 * @jest-environment node
 */

import { PATCH } from "@/app/api/organizations/[id]/directory/route";
import { NextRequest } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";

jest.mock("@/lib/auth", () => ({
  getAuthFromRequest: jest.fn(),
}));

const mockGetAuth = getAuthFromRequest as jest.MockedFunction<
  typeof getAuthFromRequest
>;

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const OWNER_ID = "owner-user";
const ADMIN_ID = "admin-user";

function request(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/organizations/${ORG_ID}/directory`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function chain(result: { data: unknown; error: unknown }) {
  const terminal = {
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    single: jest.fn(() => Promise.resolve(result)),
    eq: jest.fn(),
    neq: jest.fn(),
  };
  terminal.eq.mockReturnValue(terminal);
  terminal.neq.mockReturnValue(terminal);
  return {
    select: jest.fn(() => terminal),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve(result)),
        })),
      })),
    })),
  };
}

describe("PATCH /api/organizations/[id]/directory", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lets an accepted co-admin update slug and publish", async () => {
    const orgLookup = chain({
      data: { id: ORG_ID, owner_id: OWNER_ID, slug: null },
      error: null,
    });
    const memberLookup = chain({
      data: { id: "membership-1" },
      error: null,
    });
    const updateResult = chain({
      data: { id: ORG_ID, slug: "sweetwater", public_directory_enabled: true },
      error: null,
    });

    let orgSelects = 0;
    mockGetAuth.mockResolvedValue({
      ok: true,
      user: { id: ADMIN_ID } as never,
      supabase: {
        from: jest.fn((table: string) => {
          if (table === "organization_members") return memberLookup;
          if (table === "organizations") {
            orgSelects += 1;
            if (orgSelects === 1) return orgLookup;
            if (orgSelects === 2) return chain({ data: null, error: null });
            return updateResult;
          }
          return chain({ data: null, error: null });
        }),
      } as never,
    });

    const res = await PATCH(request({ slug: "sweetwater", public_directory_enabled: true }), {
      params: Promise.resolve({ id: ORG_ID }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.organization.slug).toBe("sweetwater");
  });

  it("rejects a user who is not a member", async () => {
    mockGetAuth.mockResolvedValue({
      ok: true,
      user: { id: "stranger" } as never,
      supabase: {
        from: jest.fn((table: string) => {
          if (table === "organizations") {
            return chain({
              data: { id: ORG_ID, owner_id: OWNER_ID, slug: null },
              error: null,
            });
          }
          return chain({ data: null, error: null });
        }),
      } as never,
    });

    const res = await PATCH(request({ slug: "x", public_directory_enabled: false }), {
      params: Promise.resolve({ id: ORG_ID }),
    });
    expect(res.status).toBe(403);
  });
});
