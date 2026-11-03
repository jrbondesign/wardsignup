/**
 * @jest-environment node
 */

jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: jest.fn(),
}));

jest.mock("@/lib/participant-email", () => ({
  sendParticipantReminderEmail: jest.fn(),
}));

jest.mock("@/lib/rate-limit", () => ({
  claimCronRun: jest.fn(),
  hourBucketDate: jest.fn(() => new Date("2026-10-18T12:00:00.000Z")),
}));

jest.mock("@/lib/cron-brand", () => ({
  resolveCronBrandId: jest.fn(() => "wardsignup"),
}));

jest.mock("@/lib/brand", () => ({
  publicSiteOriginAndBrandForCampaign: jest.fn(() => ({
    siteOrigin: "https://www.wardsignup.com",
    brand: { id: "wardsignup" },
  })),
}));

// Interpret session_date + time as UTC so window math is deterministic.
jest.mock("@/lib/event-timezone", () => ({
  resolveEffectiveEventTimezone: jest.fn(() => "UTC"),
  sessionStartUtc: jest.fn(
    (date: string, time: string) => new Date(`${date}T${time.slice(0, 5)}:00.000Z`),
  ),
}));

import { GET } from "@/app/api/cron/participant-reminders/route";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { sendParticipantReminderEmail } from "@/lib/participant-email";
import { claimCronRun } from "@/lib/rate-limit";
import {
  createFakeAdmin,
  cronRequest,
  eqValue,
  hasOp,
  type QueryRecord,
  type QueryResult,
} from "./cron-test-helpers";

const mockCreateClient = createServiceRoleClient as jest.MockedFunction<
  typeof createServiceRoleClient
>;
const mockSend = sendParticipantReminderEmail as jest.MockedFunction<
  typeof sendParticipantReminderEmail
>;
const mockClaim = claimCronRun as jest.MockedFunction<typeof claimCronRun>;

const PATH = "/api/cron/participant-reminders";
const SECRET = "test-cron-secret";
const NOW = new Date("2026-10-18T12:00:00.000Z").getTime();
const H = 60 * 60 * 1000;

function iso(ms: number) {
  return new Date(ms).toISOString();
}

/** Build a signup row whose slot starts at `slotMs` (UTC) and was created at `signedUpMs`. */
function row(id: string, slotMs: number, signedUpMs: number | null, extra: Record<string, unknown> = {}) {
  const d = iso(slotMs);
  return {
    id,
    member_name: `Member ${id}`,
    member_email: `${id}@example.com`,
    cancel_token: `tok-${id}`,
    signed_up_at: signedUpMs === null ? null : iso(signedUpMs),
    sessions: {
      session_date: d.slice(0, 10),
      time: d.slice(11, 16),
      end_time: null,
      day_of_week: 0,
    },
    campaigns: {
      id: "camp-1",
      name: "Camp",
      brand_id: "wardsignup",
      public_host: null,
      event_timezone: "UTC",
      event_end_date: null,
    },
    ...extra,
  };
}

function setup(opts: {
  rows?: unknown[];
  listError?: { message: string } | null;
  /** Ids whose mark-before-send update returns no rows (claimed by another run). */
  lostClaim?: string[];
  /** Ids whose mark update errors. */
  markError?: string[];
}) {
  const resolve = (q: QueryRecord): QueryResult => {
    if (q.table !== "signups") return { data: null, error: null };
    if (!hasOp(q, "update")) {
      return { data: opts.rows ?? [], error: opts.listError ?? null };
    }
    const id = eqValue(q, "id") as string;
    if (opts.markError?.includes(id)) return { data: null, error: { message: "db down" } };
    if (opts.lostClaim?.includes(id)) return { data: [], error: null };
    return { data: hasOp(q, "select") ? [{ id }] : null, error: null };
  };
  const fake = createFakeAdmin(resolve);
  mockCreateClient.mockReturnValue(fake.admin as unknown as ReturnType<typeof createServiceRoleClient>);
  return fake;
}

function markUpdates(queries: QueryRecord[]) {
  return queries.filter((q) => q.table === "signups" && hasOp(q, "update"));
}

describe("/api/cron/participant-reminders", () => {
  const originalSecret = process.env.CRON_SECRET;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let nowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    mockClaim.mockResolvedValue({ claimed: true });
    mockSend.mockResolvedValue({ ok: true });
    nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW);
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    nowSpy.mockRestore();
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.CRON_SECRET = originalSecret;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  it("returns 401 without an Authorization header", async () => {
    const res = await GET(cronRequest(PATH));
    expect(res.status).toBe(401);
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("returns 401 with the wrong bearer token", async () => {
    const res = await GET(cronRequest(PATH, "wrong"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("refuses (500) when CRON_SECRET is unset, even with an empty bearer", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(cronRequest(PATH, ""));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "CRON_SECRET is not configured" });
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("refuses when CRON_SECRET is whitespace only", async () => {
    process.env.CRON_SECRET = "   ";
    const res = await GET(cronRequest(PATH, "   "));
    expect(res.status).toBe(500);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("short-circuits when the brand-scoped hourly claim is already taken", async () => {
    mockClaim.mockResolvedValue({ claimed: false });
    const res = await GET(cronRequest(PATH, SECRET));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      brandId: "wardsignup",
      skipped: "already_ran_this_hour",
    });
    expect(mockClaim).toHaveBeenCalledWith("participant-reminders:wardsignup", expect.any(Date));
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

  it("filters the candidate query to un-reminded rows for this brand and a bounded date range", async () => {
    const { queries } = setup({ rows: [] });
    const res = await GET(cronRequest(PATH, SECRET));
    expect(res.status).toBe(200);
    const list = queries.find((q) => q.table === "signups" && !hasOp(q, "update"))!;
    expect(list.ops).toContainEqual({ method: "is", args: ["reminder_sent_at", null] });
    expect(list.ops).toContainEqual({ method: "eq", args: ["campaigns.brand_id", "wardsignup"] });
    expect(list.ops).toContainEqual({ method: "gte", args: ["sessions.session_date", "2026-10-17"] });
    expect(list.ops).toContainEqual({ method: "lte", args: ["sessions.session_date", "2026-10-20"] });
  });

  it("returns 500 when the signup list query errors", async () => {
    setup({ listError: { message: "boom" } });
    const res = await GET(cronRequest(PATH, SECRET));
    expect(res.status).toBe(500);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("marks reminder_sent_at (IS NULL guarded) before sending, then sends for eligible rows", async () => {
    const { queries } = setup({ rows: [row("a", NOW + 24 * H, NOW - 7 * 24 * H)] });
    let marksAtSend = -1;
    mockSend.mockImplementation(async () => {
      marksAtSend = markUpdates(queries).length;
      return { ok: true };
    });
    const res = await GET(cronRequest(PATH, SECRET));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, sent: 1, skipped: 0, tooRecent: 0 });

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "a@example.com",
        memberName: "Member a",
        cancelUrl: "https://www.wardsignup.com/cancel/tok-a",
        cancelToken: "tok-a",
      }),
    );

    const marks = markUpdates(queries);
    expect(marks).toHaveLength(1);
    expect(marks[0].ops).toContainEqual({ method: "eq", args: ["id", "a"] });
    expect(marks[0].ops).toContainEqual({ method: "is", args: ["reminder_sent_at", null] });
    expect(hasOp(marks[0], "select")).toBeDefined();
    // Mark query must already have been issued when the send happens.
    expect(marksAtSend).toBe(1);
  });

  it("only sends for rows it successfully marked (lost claim or mark error = no send)", async () => {
    setup({
      rows: [
        row("won", NOW + 10 * H, NOW - 7 * 24 * H),
        row("lost", NOW + 10 * H, NOW - 7 * 24 * H),
        row("err", NOW + 10 * H, NOW - 7 * 24 * H),
      ],
      lostClaim: ["lost"],
      markError: ["err"],
    });
    const res = await GET(cronRequest(PATH, SECRET));
    const body = await res.json();
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].to).toBe("won@example.com");
    expect(body.sent).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.errors).toEqual(["err: db down"]);
  });

  it("does not un-mark or retry when the send fails after marking (at-most-once)", async () => {
    mockSend.mockResolvedValue({ ok: false, error: "resend down" });
    const { queries } = setup({ rows: [row("a", NOW + 5 * H, NOW - 7 * 24 * H)] });
    const res = await GET(cronRequest(PATH, SECRET));
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.errors).toEqual(["a: resend down"]);
    expect(markUpdates(queries)).toHaveLength(1);
  });

  describe("send window (now .. now+25h)", () => {
    it("includes a slot exactly 25h out and excludes one just past 25h", async () => {
      const { queries } = setup({
        rows: [
          row("edge", NOW + 25 * H, NOW - 7 * 24 * H),
          row("beyond", NOW + 25 * H + 60 * 1000, NOW - 7 * 24 * H),
        ],
      });
      const body = await (await GET(cronRequest(PATH, SECRET))).json();
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend.mock.calls[0][0].to).toBe("edge@example.com");
      expect(body.skipped).toBe(1);
      expect(markUpdates(queries).map((q) => eqValue(q, "id"))).toEqual(["edge"]);
    });

    it("includes a slot starting right now and skips (without marking) slots already started", async () => {
      const { queries } = setup({
        rows: [
          row("now", NOW, NOW - 7 * 24 * H),
          row("past", NOW - 60 * 1000, NOW - 7 * 24 * H),
        ],
      });
      const body = await (await GET(cronRequest(PATH, SECRET))).json();
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend.mock.calls[0][0].to).toBe("now@example.com");
      expect(body.skipped).toBe(1);
      expect(markUpdates(queries).map((q) => eqValue(q, "id"))).toEqual(["now"]);
    });

    it("skips undated (recurring) sessions and rows without email", async () => {
      const undated = row("undated", NOW + 5 * H, NOW - 7 * 24 * H);
      (undated.sessions as { session_date: string | null }).session_date = null;
      const noEmail = row("noemail", NOW + 5 * H, NOW - 7 * 24 * H, { member_email: "  " });
      const { queries } = setup({ rows: [undated, noEmail] });
      const body = await (await GET(cronRequest(PATH, SECRET))).json();
      expect(body.skipped).toBe(2);
      expect(mockSend).not.toHaveBeenCalled();
      expect(markUpdates(queries)).toHaveLength(0);
    });
  });

  describe("48h signup-to-slot boundary", () => {
    it("sends when the signup was exactly 48h before the slot", async () => {
      const slot = NOW + 20 * H;
      setup({ rows: [row("exact", slot, slot - 48 * H)] });
      const body = await (await GET(cronRequest(PATH, SECRET))).json();
      expect(body).toMatchObject({ sent: 1, tooRecent: 0 });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it("marks as handled without sending when signup was just under 48h before the slot", async () => {
      const slot = NOW + 20 * H;
      const { queries } = setup({ rows: [row("recent", slot, slot - 48 * H + 60 * 1000)] });
      const body = await (await GET(cronRequest(PATH, SECRET))).json();
      expect(body).toMatchObject({ sent: 0, tooRecent: 1 });
      expect(mockSend).not.toHaveBeenCalled();
      const marks = markUpdates(queries);
      expect(marks).toHaveLength(1);
      expect(marks[0].ops).toContainEqual({ method: "is", args: ["reminder_sent_at", null] });
    });

    it("treats a missing signed_up_at as old enough and sends", async () => {
      setup({ rows: [row("nodate", NOW + 3 * H, null)] });
      const body = await (await GET(cronRequest(PATH, SECRET))).json();
      expect(body.sent).toBe(1);
    });

    it("reports (not counts) a too-recent row whose mark fails", async () => {
      const slot = NOW + 20 * H;
      setup({ rows: [row("r", slot, slot - 1 * H)], markError: ["r"] });
      const body = await (await GET(cronRequest(PATH, SECRET))).json();
      expect(body.tooRecent).toBe(0);
      expect(body.errors).toEqual(["r: mark too-recent failed: db down"]);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
