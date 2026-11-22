/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

const mockCapture = jest.fn();
jest.mock("@/lib/posthog-server", () => ({
  captureServerException: (...a: unknown[]) => mockCapture(...a),
}));
jest.mock("@/lib/event-page-cache", () => ({ revalidateEventPage: jest.fn() }));
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  after: (cb: () => unknown) => void cb(),
}));
jest.mock("@/lib/rate-limit", () => ({ consumeActionRate: async () => ({ allowed: true }) }));
jest.mock("@/lib/gcal-feature", () => ({ isGcalSyncFeatureEnabled: () => false }));
jest.mock("@/lib/google-calendar-sync", () => ({ syncCampaignCalendar: jest.fn() }));

const GOOD_TOKEN = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const BAD_TOKEN = "not-a-real-token-xyz";

type Result = { data: unknown; error: unknown };
let lookupResult: Result;
jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => {
          const q = {
            abortSignal: () => q,
            maybeSingle: async () => lookupResult,
          };
          return q;
        },
      }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

import { GET } from "@/app/api/signups/cancel/lookup/route";
import { POST } from "@/app/api/signups/cancel/route";
import { CancelLookupError, isWellFormedCancelToken } from "@/lib/cancel-lookup-error";

/** Shape of the PostgrestError Supabase returns for a non uuid cancel token. */
const pg22P02 = (token: string) => ({
  code: "22P02",
  message: `invalid input syntax for type uuid: "${token}"`,
  details: null,
  hint: null,
});

const lookupReq = (token: string) =>
  new NextRequest(`http://localhost/api/signups/cancel/lookup?token=${encodeURIComponent(token)}`);
const cancelReq = (token: string) =>
  new NextRequest("http://localhost/api/signups/cancel", { method: "POST", body: JSON.stringify({ token }) });

const foundRow = {
  member_name: "Pat",
  guest_names: [],
  sessions: { day_of_week: 1, time: "09:00", end_time: null, session_date: "2026-12-01" },
  campaigns: {
    id: "camp-1",
    name: "Ward dinner",
    brand_id: null,
    public_host: null,
    event_timezone: "America/Phoenix",
    event_end_date: null,
    event_type: null,
  },
};

beforeEach(() => {
  mockCapture.mockReset();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

function expectOneSafeCapture(route: string, token: string) {
  expect(mockCapture).toHaveBeenCalledTimes(1);
  const [err, ctx] = mockCapture.mock.calls[0];
  expect(err).toBeInstanceOf(CancelLookupError);
  expect((err as Error).message).toBe("Cancel link lookup failed (22P02)");
  expect(ctx).toEqual({
    route,
    properties: { kind: "cancel_lookup_db_error", error_code: "22P02", token_malformed: true },
  });
  // Neither the token nor the database message (which echoes it) leaves the process.
  const payload = JSON.stringify([String(err), (err as Error).stack, ctx]);
  expect(payload).not.toContain(token);
  expect(payload).not.toContain("invalid input syntax");
}

describe("cancel link lookup error tracking", () => {
  it("captures one exception with code 22P02 and no token for a malformed lookup token", async () => {
    lookupResult = { data: null, error: pg22P02(BAD_TOKEN) };
    const res = await GET(lookupReq(BAD_TOKEN));
    expect(res.status).toBe(500);
    // What the person sees is unchanged: the generic error message.
    expect(await res.json()).toEqual({ error: "Something went wrong." });
    expectOneSafeCapture("/api/signups/cancel/lookup", BAD_TOKEN);
  });

  it("captures the same for a malformed token posted to cancel", async () => {
    lookupResult = { data: null, error: pg22P02(BAD_TOKEN) };
    const res = await POST(cancelReq(BAD_TOKEN));
    expect(res.status).toBe(500);
    expectOneSafeCapture("/api/signups/cancel", BAD_TOKEN);
  });

  it("sends nothing for a good cancel link", async () => {
    lookupResult = { data: foundRow, error: null };
    const lookup = await GET(lookupReq(GOOD_TOKEN));
    expect(lookup.status).toBe(200);
    expect((await lookup.json()).member_name).toBe("Pat");

    lookupResult = { data: { id: "s1", member_name: "Pat", campaign_id: "camp-1" }, error: null };
    const cancel = await POST(cancelReq(GOOD_TOKEN));
    expect(cancel.status).toBe(200);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("sends nothing when a well formed token simply isn't found", async () => {
    lookupResult = { data: null, error: null };
    expect((await GET(lookupReq(GOOD_TOKEN))).status).toBe(404);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("tells malformed tokens apart from well formed ones", () => {
    expect(isWellFormedCancelToken(GOOD_TOKEN)).toBe(true);
    expect(isWellFormedCancelToken(BAD_TOKEN)).toBe(false);
    expect(isWellFormedCancelToken("")).toBe(false);
  });
});
