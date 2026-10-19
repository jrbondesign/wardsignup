const insert = jest.fn().mockResolvedValue({ error: null });
let existing: { data: unknown; error: unknown } = { data: [], error: null };
const filters: Array<[string, unknown]> = [];
jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: (c: string, v: unknown) => (filters.push([c, v]), chain),
        in: (c: string, v: unknown) => (filters.push([c, v]), chain),
        limit: () => Promise.resolve(existing),
        insert,
      };
      return chain;
    },
  }),
}));

import { enqueueEmail } from "@/lib/email-queue";

const row = {
  brand_id: "wardsignup",
  category: "transactional" as const,
  kind: "welcome",
  from_address: "J <j@wardsignup.com>",
  to_address: "a@b.com",
  subject: "Welcome",
  html: "x",
  text_body: null,
  reply_to: null,
  attachments: null,
  send_after: "2026-10-12T16:00:00.000Z",
};

beforeEach(() => {
  insert.mockClear();
  filters.length = 0;
  existing = { data: [], error: null };
});

it("skips the insert when the same email is already pending or sending", async () => {
  existing = { data: [{ id: "q1" }], error: null };
  expect(await enqueueEmail(row, { dedupe: true })).toEqual({ ok: true, deduped: true });
  expect(insert).not.toHaveBeenCalled();
  expect(filters).toEqual([
    ["brand_id", "wardsignup"],
    ["kind", "welcome"],
    ["to_address", "a@b.com"],
    ["subject", "Welcome"],
    ["status", ["pending", "sending"]],
  ]);
});

it("inserts when there is no identical queued email", async () => {
  expect(await enqueueEmail(row, { dedupe: true })).toEqual({ ok: true });
  expect(insert).toHaveBeenCalledTimes(1);
});

it("still inserts if the lookup fails (don't lose the welcome)", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  existing = { data: null, error: { message: "db down" } };
  expect(await enqueueEmail(row, { dedupe: true })).toEqual({ ok: true });
  expect(insert).toHaveBeenCalledTimes(1);
});

it("no lookup without dedupe", async () => {
  await enqueueEmail(row);
  expect(filters).toHaveLength(0);
  expect(insert).toHaveBeenCalledTimes(1);
});
