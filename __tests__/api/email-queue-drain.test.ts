/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

type Row = { id: string; kind: string; send_after: string; status: string; attempts: number };
let rows: Row[] = [];
const listCalls: Array<{ in?: string[]; notIn?: string }> = [];

// Minimal email_queue fake: select chains record the kind filter, update chains claim rows.
function makeAdmin() {
  return {
    from: () => ({
      select: () => {
        const q: { in?: string[]; notIn?: string } = {};
        const chain = {
          eq: () => chain,
          in: (_c: string, v: string[]) => ((q.in = v), chain),
          not: (_c: string, _op: string, v: string) => ((q.notIn = v), chain),
          lte: () => chain,
          order: () => chain,
          limit: () => {
            listCalls.push(q);
            const kinds = q.in ?? null;
            const excluded = q.notIn ? q.notIn.replace(/[()]/g, "").split(",") : null;
            const data = rows.filter(
              (r) => r.status === "pending" && (kinds ? kinds.includes(r.kind) : !excluded!.includes(r.kind)),
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
