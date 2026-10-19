/**
 * @jest-environment node
 */

jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: jest.fn(),
}));

jest.mock("@/lib/email-send", () => ({
  sendGuardedEmail: jest.fn(),
}));

jest.mock("@/lib/brand/brands", () => ({
  getBrandDefinition: jest.fn((id: string) =>
    id === "wardsignup" ? { id: "wardsignup", name: "WardSignup" } : undefined,
  ),
  toPublicBrand: jest.fn((def: { id: string }) => ({ id: def.id })),
}));

import { GET, STALE_CLAIM_MS } from "@/app/api/cron/email-queue/route";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { sendGuardedEmail } from "@/lib/email-send";
import type { QueuedEmailRow } from "@/lib/email-queue";
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
const mockSend = sendGuardedEmail as jest.MockedFunction<typeof sendGuardedEmail>;

const PATH = "/api/cron/email-queue";
const SECRET = "test-cron-secret";

function queued(id: string, extra: Partial<QueuedEmailRow> = {}): QueuedEmailRow {
  return {
    id,
    status: "pending",
    attempts: 0,
    brand_id: "wardsignup",
    category: "notification",
    kind: "digest",
    from_address: "WardSignup <noreply@wardsignup.com>",
    to_address: `${id}@example.com`,
    subject: `Subject ${id}`,
    html: "<p>hi</p>",
    text_body: null,
    reply_to: null,
    attachments: null,
    send_after: "2026-10-18T00:00:00.000Z",
    ...extra,
  };
}

function isRecovery(q: QueryRecord) {
  return hasOp(q, "update") !== undefined && eqValue(q, "status") === "sending";
}

function setup(opts: {
  rows?: QueuedEmailRow[];
  listError?: { message: string };
  lostClaim?: string[];
  requeued?: string[];
  expired?: string[];
}) {
  const resolve = (q: QueryRecord): QueryResult => {
    if (isRecovery(q)) {
      const ids = hasOp(q, "gte") ? opts.expired : opts.requeued;
      return { data: (ids ?? []).map((id) => ({ id })), error: null };
    }
    if (!hasOp(q, "update")) {
      return { data: opts.rows ?? [], error: opts.listError ?? null };
    }
    const id = eqValue(q, "id") as string;
    // Claim query: update(...).eq(id).eq(status,pending).select("id")
    if (hasOp(q, "select")) {
      return { data: opts.lostClaim?.includes(id) ? [] : [{ id }], error: null };
    }
    return { data: null, error: null };
  };
  const fake = createFakeAdmin(resolve);
  mockCreateClient.mockReturnValue(fake.admin as unknown as ReturnType<typeof createServiceRoleClient>);
  return fake;
}

/** Final status written for a row (last non-claim update). */
function updatesFor(queries: QueryRecord[], id: string) {
  return queries
    .filter((q) => hasOp(q, "update") && eqValue(q, "id") === id)
    .map((q) => ({
      claim: Boolean(hasOp(q, "select")),
      payload: hasOp(q, "update")!.args[0] as Record<string, unknown>,
      ops: q.ops,
    }));
}

describe("/api/cron/email-queue", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    mockSend.mockResolvedValue({ ok: true });
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("returns 401 without an Authorization header", async () => {
    const res = await GET(cronRequest(PATH));
    expect(res.status).toBe(401);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("returns 401 with the wrong bearer token", async () => {
    const res = await GET(cronRequest(PATH, "nope"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("refuses (500) when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(cronRequest(PATH, ""));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "CRON_SECRET is not configured" });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("returns 500 when listing the queue fails", async () => {
    setup({ listError: { message: "boom" } });
    const res = await GET(cronRequest(PATH, SECRET));
    expect(res.status).toBe(500);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("lists only pending rows whose send_after has passed", async () => {
    const { queries } = setup({ rows: [] });
    await GET(cronRequest(PATH, SECRET));
    const list = queries.find((q) => !hasOp(q, "update"))!;
    expect(list.table).toBe("email_queue");
    expect(list.ops).toContainEqual({ method: "eq", args: ["status", "pending"] });
    expect(hasOp(list, "lte")?.args[0]).toBe("send_after");
  });

  it("claims each row (pending -> sending) before sending, then marks sent", async () => {
    const { queries } = setup({ rows: [queued("a"), queued("b", { attempts: 1 })] });
    let claimsAtFirstSend = -1;
    mockSend.mockImplementation(async () => {
      if (claimsAtFirstSend < 0) {
        claimsAtFirstSend = updatesFor(queries, "a").filter((u) => u.claim).length;
      }
      return { ok: true };
    });

    const body = await (await GET(cronRequest(PATH, SECRET))).json();
    expect(body).toEqual({
      ok: true,
      sent: 2,
      failed: 0,
      skipped: 0,
      recovered: 0,
      expired: 0,
      stoppedOverBudget: false,
    });
    expect(claimsAtFirstSend).toBe(1);
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: "a@example.com", fromQueue: true, brand: { id: "wardsignup" } }),
    );

    const a = updatesFor(queries, "a");
    expect(a[0].claim).toBe(true);
    expect(a[0].payload).toEqual({ status: "sending", attempts: 1, claimed_at: expect.any(String) });
    expect(a[0].ops).toContainEqual({ method: "eq", args: ["status", "pending"] });
    expect(a[1].payload).toMatchObject({ status: "sent", last_error: null });
    expect(updatesFor(queries, "b")[0].payload).toMatchObject({ status: "sending", attempts: 2 });
  });

  it("does not send a row another run already claimed", async () => {
    setup({ rows: [queued("mine"), queued("theirs")], lostClaim: ["theirs"] });
    const body = await (await GET(cronRequest(PATH, SECRET))).json();
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].to).toBe("mine@example.com");
    expect(body.sent).toBe(1);
  });

  it("fails rows with an unknown brand without sending", async () => {
    const { queries } = setup({ rows: [queued("x", { brand_id: "nope" })] });
    const body = await (await GET(cronRequest(PATH, SECRET))).json();
    expect(mockSend).not.toHaveBeenCalled();
    expect(body.failed).toBe(1);
    expect(updatesFor(queries, "x")[1].payload).toEqual({ status: "failed", last_error: "unknown brand" });
  });

  it("marks suppressed recipients as skipped", async () => {
    mockSend.mockResolvedValue({ ok: false, skipped: "suppressed" });
    const { queries } = setup({ rows: [queued("s")] });
    const body = await (await GET(cronRequest(PATH, SECRET))).json();
    expect(body.skipped).toBe(1);
    expect(updatesFor(queries, "s")[1].payload).toEqual({ status: "skipped", last_error: "suppressed" });
  });

  it("stops on over-budget, returning the row to pending without consuming an attempt", async () => {
    mockSend.mockResolvedValueOnce({ ok: false, overBudget: true, error: "daily quota" });
    const { queries } = setup({ rows: [queued("a", { attempts: 1 }), queued("b")] });
    const body = await (await GET(cronRequest(PATH, SECRET))).json();
    expect(body).toMatchObject({ stoppedOverBudget: true, sent: 0 });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(updatesFor(queries, "a")[1].payload).toEqual({
      status: "pending",
      attempts: 1,
      last_error: "daily quota",
    });
    expect(updatesFor(queries, "b")).toHaveLength(0);
  });

  it("retries failures as pending until the third attempt, then fails", async () => {
    mockSend.mockResolvedValue({ ok: false, error: "500 from resend" });
    const { queries } = setup({ rows: [queued("retry", { attempts: 1 }), queued("dead", { attempts: 2 })] });
    const body = await (await GET(cronRequest(PATH, SECRET))).json();
    expect(body.failed).toBe(2);
    expect(updatesFor(queries, "retry")[1].payload).toEqual({ status: "pending", last_error: "500 from resend" });
    expect(updatesFor(queries, "dead")[1].payload).toEqual({ status: "failed", last_error: "500 from resend" });
  });

  describe("stale claim recovery", () => {
    it("requeues stale sending rows with attempts left and fails exhausted ones, before listing", async () => {
      const now = Date.parse("2026-10-18T01:00:00.000Z");
      jest.spyOn(Date, "now").mockReturnValue(now);
      const { queries } = setup({ rows: [], requeued: ["r1", "r2"], expired: ["e1"] });

      const body = await (await GET(cronRequest(PATH, SECRET))).json();
      expect(body).toMatchObject({ recovered: 2, expired: 1, failed: 0 });

      const recovery = queries.filter(isRecovery);
      expect(recovery).toHaveLength(2);
      const listIdx = queries.findIndex((q) => !hasOp(q, "update"));
      expect(queries.indexOf(recovery[0])).toBeLessThan(listIdx);
      expect(queries.indexOf(recovery[1])).toBeLessThan(listIdx);

      const cutoff = new Date(now - STALE_CLAIM_MS).toISOString();
      const [requeue, expire] = recovery;
      expect(hasOp(requeue, "update")!.args[0]).toEqual({ status: "pending", last_error: "claim expired" });
      expect(requeue.ops).toContainEqual({ method: "lt", args: ["claimed_at", cutoff] });
      expect(requeue.ops).toContainEqual({ method: "lt", args: ["attempts", 3] });
      expect(hasOp(expire, "update")!.args[0]).toEqual({ status: "failed", last_error: "claim expired" });
      expect(expire.ops).toContainEqual({ method: "lt", args: ["claimed_at", cutoff] });
      expect(expire.ops).toContainEqual({ method: "gte", args: ["attempts", 3] });
    });

    it("uses a threshold well above the function's maxDuration", () => {
      expect(STALE_CLAIM_MS).toBeGreaterThanOrEqual(15 * 60 * 1000);
    });

    it("keeps draining when recovery fails", async () => {
      const fake = createFakeAdmin((q) => {
        if (isRecovery(q)) return { data: null, error: { message: "boom" } };
        if (!hasOp(q, "update")) return { data: [queued("a")], error: null };
        return { data: hasOp(q, "select") ? [{ id: "a" }] : null, error: null };
      });
      mockCreateClient.mockReturnValue(fake.admin as unknown as ReturnType<typeof createServiceRoleClient>);
      const body = await (await GET(cronRequest(PATH, SECRET))).json();
      expect(body).toMatchObject({ sent: 1, recovered: 0, expired: 0 });
    });
  });
});
