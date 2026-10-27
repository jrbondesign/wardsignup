/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/posthog-query", () => ({
  posthogWeeklyEventCounts: jest.fn(async () => null),
  posthogCoreWeekly: jest.fn(async () => null),
}));

import { GET } from "@/app/api/metrics/route";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

const ADMIN_EMAIL = "bondesign@gmail.com";
const CREATOR = { id: "u-1", email: "leader@example.com", created_at: "2026-10-01T00:00:00Z", app_metadata: {} };

type Result = { data: unknown; error: unknown; count?: number };

/**
 * Chainable fake of the Supabase query builder. Every filter returns the chain and
 * awaiting it resolves the result chosen by `resolve(table, columns)`.
 */
function fakeDb(resolve: (table: string, columns: string) => Result) {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          const result = () => resolve(table, columns);
          const chain: Record<string, unknown> = {};
          for (const m of ["eq", "in", "not", "gte", "order", "limit", "range"]) chain[m] = () => chain;
          chain.maybeSingle = () => Promise.resolve(result());
          chain.single = () => Promise.resolve(result());
          chain.then = (ok: (r: Result) => unknown, bad?: (e: unknown) => unknown) =>
            Promise.resolve(result()).then(ok, bad);
          return chain;
        },
      };
    },
    rpc(fn: string) {
      if (fn === "metrics_creator_breakdown") {
        return Promise.resolve({
          data: [{ organizer_email: CREATOR.email, event_count: 2, session_count: 3, signup_count: 9 }],
          error: null,
        });
      }
      return Promise.resolve({ data: 0, error: null });
    },
    auth: {
      getUser: async () => ({ data: { user: { id: "admin", email: ADMIN_EMAIL } }, error: null }),
      admin: { listUsers: async () => ({ data: { users: [CREATOR] }, error: null }) },
    },
  };
}

const missingColumn = (col: string) => ({ code: "42703", message: `column ${col} does not exist` });

function run(resolve: (table: string, columns: string) => Result) {
  const db = fakeDb(resolve);
  mockCreateClient.mockReturnValue(db as never);
  return GET(
    new NextRequest("http://wardsignup.com/api/metrics", { headers: { authorization: "Bearer tok" } }),
  );
}

describe("GET /api/metrics creator Ward/Unit, Organization and Calling", () => {
  const env = process.env;
  beforeEach(() => {
    process.env = {
      ...env,
      NEXT_PUBLIC_SUPABASE_URL: "http://supabase.test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      METRICS_ADMIN_EMAILS: ADMIN_EMAIL,
    };
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = env;
    jest.restoreAllMocks();
  });

  const baseRows = (table: string, columns: string): Result => {
    if (table === "organizer_profiles") return { data: [{ user_id: CREATOR.id, calling: "Bishop" }], error: null };
    if (table === "organization_members") {
      return { data: [{ user_id: CREATOR.id, role: "owner", status: "accepted", organizations: { brand_id: "wardsignup" } }], error: null };
    }
    if (table === "organizations" && columns.includes("ward_name")) {
      return { data: [{ id: "o-1", owner_id: CREATOR.id, name: "Elders Quorum", ward_name: "Maple Ridge Ward" }], error: null };
    }
    if (table === "organizations" && columns.startsWith("id, owner_id, name")) {
      return { data: [{ id: "o-1", owner_id: CREATOR.id, name: "Elders Quorum" }], error: null };
    }
    return { data: [], error: null, count: 0 };
  };

  it("still loads before the migration, with callings and Ward/Unit not set", async () => {
    const res = await run((table, columns) => {
      if (table === "organizer_profiles" && columns.includes("calling")) return { data: null, error: missingColumn("organizer_profiles.calling") };
      if (table === "organizations" && columns.includes("ward_name")) return { data: null, error: missingColumn("organizations.ward_name") };
      return baseRows(table, columns);
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.callingsAvailable).toBe(false);
    expect(body.wardsAvailable).toBe(false);
    expect(body.creators).toEqual([
      expect.objectContaining({ email: CREATOR.email, calling: null, wardName: null, organization: "Elders Quorum", signups: 9 }),
    ]);
  });

  it("shows Ward/Unit, Organization and Calling once the migration is applied", async () => {
    const res = await run(baseRows);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.callingsAvailable).toBe(true);
    expect(body.wardsAvailable).toBe(true);
    expect(body.creators[0]).toEqual(
      expect.objectContaining({ wardName: "Maple Ridge Ward", organization: "Elders Quorum", calling: "Bishop" }),
    );
  });

  it("stays admin only", async () => {
    const db = fakeDb(baseRows);
    db.auth.getUser = async () => ({ data: { user: { id: "x", email: "someone@example.com" } }, error: null });
    mockCreateClient.mockReturnValue(db as never);
    const res = await GET(
      new NextRequest("http://wardsignup.com/api/metrics", { headers: { authorization: "Bearer tok" } }),
    );
    expect(res.status).toBe(403);
  });
});
