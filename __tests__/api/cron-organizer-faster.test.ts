/**
 * @jest-environment node
 */

jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: jest.fn(),
}));

jest.mock("@/lib/organizer-email", () => ({
  sendOrganizerFasterAlertEmail: jest.fn(),
}));

jest.mock("@/lib/rate-limit", () => ({
  claimCronRun: jest.fn(),
  hourBucketDate: jest.fn(() => new Date("2026-10-18T12:00:00.000Z")),
}));

jest.mock("@/lib/cron-brand", () => ({
  resolveCronBrandId: jest.fn(() => "wardsignup"),
}));

import { GET } from "@/app/api/cron/organizer-faster/route";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { sendOrganizerFasterAlertEmail } from "@/lib/organizer-email";
import { claimCronRun } from "@/lib/rate-limit";
import { createFakeAdmin, cronRequest, type QueryResult } from "./cron-test-helpers";

const mockCreateClient = createServiceRoleClient as jest.MockedFunction<
  typeof createServiceRoleClient
>;
const mockSend = sendOrganizerFasterAlertEmail as jest.MockedFunction<
  typeof sendOrganizerFasterAlertEmail
>;
const mockClaim = claimCronRun as jest.MockedFunction<typeof claimCronRun>;

const PATH = "/api/cron/organizer-faster";
const SECRET = "test-cron-secret";

function setup(result: QueryResult) {
  const fake = createFakeAdmin(() => result);
  mockCreateClient.mockReturnValue(fake.admin as unknown as ReturnType<typeof createServiceRoleClient>);
  return fake;
}

describe("/api/cron/organizer-faster", () => {
  const originalSecret = process.env.CRON_SECRET;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    mockClaim.mockResolvedValue({ claimed: true });
    mockSend.mockResolvedValue({ ok: true });
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(() => {
    process.env.CRON_SECRET = originalSecret;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  it("returns 401 without an Authorization header", async () => {
    const res = await GET(cronRequest(PATH));
    expect(res.status).toBe(401);
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("returns 401 with the wrong bearer token", async () => {
    const res = await GET(cronRequest(PATH, "wrong"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("refuses (500) when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(cronRequest(PATH, ""));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "CRON_SECRET is not configured" });
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("short-circuits on an already-claimed brand-scoped hour bucket", async () => {
    mockClaim.mockResolvedValue({ claimed: false });
    const res = await GET(cronRequest(PATH, SECRET));
    expect(await res.json()).toEqual({ ok: true, brandId: "wardsignup", skipped: "already_ran_this_hour" });
    expect(mockClaim).toHaveBeenCalledWith("organizer-faster:wardsignup", expect.any(Date));
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does not burn the hourly claim when the service role is missing", async () => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const res = await GET(cronRequest(PATH, SECRET));
      expect(res.status).toBe(500);
      expect(mockClaim).not.toHaveBeenCalled();
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    }
  });

  it("returns 500 when listing campaigns fails", async () => {
    setup({ data: null, error: { message: "boom" } });
    const res = await GET(cronRequest(PATH, SECRET));
    expect(res.status).toBe(500);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("queries only opted-in campaigns for this brand and sends for each", async () => {
    const { queries } = setup({ data: [{ id: "c1" }, { id: "c2" }], error: null });
    const body = await (await GET(cronRequest(PATH, SECRET))).json();
    expect(body).toEqual({ ok: true, brandId: "wardsignup", sent: 2, skipped: 0 });
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls.map((c) => c[1])).toEqual(["c1", "c2"]);
    expect(queries[0].table).toBe("campaigns");
    expect(queries[0].ops).toContainEqual({ method: "eq", args: ["organizer_instant_notify_enabled", true] });
    expect(queries[0].ops).toContainEqual({ method: "eq", args: ["brand_id", "wardsignup"] });
  });

  it("counts skip reasons as skipped and collects errors / throws per campaign", async () => {
    setup({ data: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }], error: null });
    mockSend
      .mockResolvedValueOnce({ ok: false, skipped: "no_new_signups" })
      .mockResolvedValueOnce({ ok: false, skipped: "throttled" })
      .mockResolvedValueOnce({ ok: false, skipped: "no_organizer_email" })
      .mockResolvedValueOnce({ ok: false, error: "resend 500" })
      .mockRejectedValueOnce(new Error("kaboom"));
    const body = await (await GET(cronRequest(PATH, SECRET))).json();
    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(3);
    expect(body.errors).toEqual(["d: resend 500", "e: kaboom"]);
  });
});
