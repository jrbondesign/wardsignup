/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

type Row = { id: string; kind: string; send_after: string; status: string; attempts: number; last_error?: string | null };
let rows: Row[] = [];
const listCalls: Array<{ in?: string[]; notIn?: string; lte?: string }> = [];

// Minimal email_queue fake: select chains record the kind filter, update chains claim rows.
function makeAdmin() {
  return {
    from: () => ({
      select: () => {
        const q: { in?: string[]; notIn?: string; lte?: string } = {};
        const chain = {
          eq: () => chain,
          in: (_c: string, v: string[]) => ((q.in = v), chain),
          not: (_c: string, _op: string, v: string) => ((q.notIn = v), chain),
          lte: (_c: string, v: string) => ((q.lte = v), chain),
          order: () => chain,
          limit: () => {
            listCalls.push(q);
            const kinds = q.in ?? null;
            const excluded = q.notIn ? q.notIn.replace(/[()]/g, "").split(",") : null;
            const data = rows.filter(
              (r) => r.status === "pending" && (!q.lte || Date.parse(r.send_after) <= Date.parse(q.lte)) && (kinds ? kinds.includes(r.kind) : !excluded!.includes(r.kind)),
            );
            return Promise.resolve({ data: data.map((r) => ({ ...r })), error: null });
          },
        };
        return chain;
      },
      update: (patch: Partial<Row>) => {
        let id = "";
        const chain = {
          eq: (c: string, v: string) => {
            if (c === "id") id = v;
            return chain;
          },
          select: () => {
            const r = rows.find((x) => x.id === id && x.status === "pending");
            if (r) Object.assign(r, patch);
            return Promise.resolve({ data: r ? [{ id }] : [] });
          },
          then: (res: (v: unknown) => void) => {
            const r = rows.find((x) => x.id === id);
            if (r) Object.assign(r, patch);
            res({ error: null });
          },
        };
        return chain;
      },
    }),
  };
}
jest.mock("@/lib/supabase-admin", () => ({ createServiceRoleClient: () => makeAdmin() }));
jest.mock("@/lib/brand/brands", () => ({
  getBrandDefinition: () => ({ id: "wardsignup" }),
  toPublicBrand: (d: unknown) => d,
}));
const sendGuardedEmail = jest.fn();
jest.mock("@/lib/email-send", () => ({ sendGuardedEmail: (...a: unknown[]) => sendGuardedEmail(...a) }));

import { GET } from "@/app/api/cron/email-queue/route";

const saved = { ...process.env };
const row = (id: string, kind: string, send_after: string): Row => ({ id, kind, send_after, status: "pending", attempts: 0 });
const run = () => GET(new NextRequest("https://wardsignup.com/api/cron/email-queue", { headers: { authorization: "Bearer s" } }));

beforeEach(() => {
  process.env = { ...saved, CRON_SECRET: "s" };
  listCalls.length = 0;
  sendGuardedEmail.mockReset();
});
afterAll(() => {
  process.env = saved;
});

it("sends near real time rows before an older batch backlog, with the realtime flag", async () => {
  rows = [row("d1", "digest", "2026-10-12T07:05:00Z"), row("w1", "welcome", "2026-10-12T16:00:00Z")];
  sendGuardedEmail.mockResolvedValue({ ok: true });
  const body = await (await run()).json();
  expect(body).toMatchObject({ ok: true, sent: 2 });
  expect(sendGuardedEmail.mock.calls.map((c) => [c[0].kind, c[0].realtime, c[0].fromQueue])).toEqual([
    ["welcome", true, true],
    ["digest", false, true],
  ]);
  expect(listCalls[0].in).toEqual(["welcome", "new_creator", "feedback_response"]);
  expect(listCalls[1].notIn).toBe("(welcome,new_creator,feedback_response)");
});

it("stops at the first over budget refusal; the welcome went first, the batch row stays pending", async () => {
  rows = [row("d1", "digest", "2026-10-12T07:05:00Z"), row("w1", "welcome", "2026-10-12T16:00:00Z")];
  sendGuardedEmail.mockImplementation((p: { kind: string }) =>
    Promise.resolve(p.kind === "welcome" ? { ok: true } : { ok: false, overBudget: true, error: "limit" }),
  );
  const body = await (await run()).json();
  expect(body).toMatchObject({ sent: 1, stoppedOverBudget: true });
  expect(rows.find((r) => r.id === "w1")!.status).toBe("sent");
  expect(rows.find((r) => r.id === "d1")).toMatchObject({ status: "pending", attempts: 0 });
});

describe("near real time retries after a Brevo failure", () => {
  afterEach(() => jest.useRealTimers());
  const brevoFail = { ok: false, error: "Brevo 500: boom", brevoFailed: true };

  it("backs off (next run, then about 2 hours) and gives up after 3 attempts; never sends again", async () => {
    jest.useFakeTimers();
    jest.spyOn(console, "error").mockImplementation(() => {});
    rows = [row("w1", "welcome", "2026-10-12T16:00:00Z")];
    sendGuardedEmail.mockResolvedValue(brevoFail);
    const w = () => rows[0];

    // Run 1, 9:07 AM AZ: attempt 1 fails, due again at once (next hourly run)
    jest.setSystemTime(new Date("2026-10-12T16:07:00Z"));
    await run();
    expect(w()).toMatchObject({ status: "pending", attempts: 1, send_after: "2026-10-12T16:07:00.000Z" });

    // Run 2, 10:07 AM AZ: attempt 2 fails, backs off 115 minutes
    jest.setSystemTime(new Date("2026-10-12T17:07:00Z"));
    await run();
    expect(w()).toMatchObject({ status: "pending", attempts: 2, send_after: "2026-10-12T19:02:00.000Z" });

    // 11:07 AM AZ: not due yet, nothing sent
    jest.setSystemTime(new Date("2026-10-12T18:07:00Z"));
    await run();
    expect(sendGuardedEmail).toHaveBeenCalledTimes(2);

    // 12:07 PM AZ: attempt 3 fails, row is failed
    jest.setSystemTime(new Date("2026-10-12T19:07:00Z"));
    await run();
    expect(w()).toMatchObject({ status: "failed", attempts: 3 });

    // Later runs never touch it
    jest.setSystemTime(new Date("2026-10-13T07:07:00Z"));
    await run();
    expect(sendGuardedEmail).toHaveBeenCalledTimes(3);
  });

  it("a retry that succeeds is sent once and marked sent", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-12T17:07:00Z"));
    rows = [{ ...row("w1", "welcome", "2026-10-12T16:07:00Z"), attempts: 1 }];
    sendGuardedEmail.mockResolvedValue({ ok: true });
    await run();
    await run();
    expect(sendGuardedEmail).toHaveBeenCalledTimes(1);
    expect(rows[0].status).toBe("sent");
  });

  it("a Brevo failure doesn't stop the run; later rows still go", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-12T17:07:00Z"));
    rows = [row("w1", "welcome", "2026-10-12T16:00:00Z"), row("n1", "new_creator", "2026-10-12T16:30:00Z")];
    sendGuardedEmail.mockImplementation((p: { kind: string }) => Promise.resolve(p.kind === "welcome" ? brevoFail : { ok: true }));
    const body = await (await run()).json();
    expect(body).toMatchObject({ sent: 1, failed: 1, stoppedOverBudget: false });
  });

  it("batch rows keep their send_after on failure (no backoff change)", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-12T07:07:00Z"));
    rows = [row("d1", "digest", "2026-10-12T07:05:00Z")];
    sendGuardedEmail.mockResolvedValue({ ok: false, error: "send failed" });
    await run();
    expect(rows[0]).toMatchObject({ status: "pending", attempts: 1, send_after: "2026-10-12T07:05:00Z" });
  });

  it("an overlapping run can't send a row another run already claimed", async () => {
    rows = [{ ...row("w1", "welcome", "2026-10-12T16:00:00Z"), status: "sending" }];
    sendGuardedEmail.mockResolvedValue({ ok: true });
    await run();
    expect(sendGuardedEmail).not.toHaveBeenCalled();
  });
});
