const rpc = jest.fn();
const insert = jest.fn();
jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: () => ({
    rpc,
    from: () => ({ insert }),
  }),
}));

import { enqueueEmail } from "@/lib/email-queue";

const row = {
  brand_id: "wardsignup",
  category: "notification" as const,
  kind: "organizer_report",
  from_address: "Jonathan <jonathan@wardsignup.com>",
  to_address: "organizer@example.com",
  subject: "Dinner · Dinner — your report",
  html: "<p>click-1</p>",
  text_body: null,
  reply_to: null,
  attachments: null,
  send_after: "2026-11-08T16:00:00.000Z",
};

beforeEach(() => {
  rpc.mockReset();
  insert.mockReset();
});

it("stores different keys with the same subject and replays one key", async () => {
  const stored = new Map<string, { status: string; html: string }>();
  rpc.mockImplementation(async (_name: string, args: { p_idempotency_key: string; p_html: string }) => {
    const existing = stored.get(args.p_idempotency_key);
    if (existing) return { data: existing.status, error: null };
    stored.set(args.p_idempotency_key, { status: "pending", html: args.p_html });
    return { data: "inserted", error: null };
  });
  expect(await enqueueEmail({ ...row, idempotency_key: "organizer_report/1" }, { dedupe: true })).toEqual({
    ok: true,
    status: "pending",
  });
  expect(
    await enqueueEmail({ ...row, html: "<p>replay</p>", idempotency_key: "organizer_report/1" }, { dedupe: true }),
  ).toEqual({ ok: true, deduped: true, status: "pending" });
  expect(
    await enqueueEmail(
      { ...row, html: "<p>click-2</p>", idempotency_key: "organizer_report/2" },
      { dedupe: true },
    ),
  ).toEqual({ ok: true, status: "pending" });
  expect(insert).not.toHaveBeenCalled();
  expect(stored.get("organizer_report/1")?.html).toBe("<p>click-1</p>");
  expect(stored.get("organizer_report/2")?.html).toBe("<p>click-2</p>");
});

it("does not queue a keyed email when the key function fails", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  rpc.mockResolvedValue({ data: null, error: { message: "email_queue_enqueue does not exist" } });
  expect(await enqueueEmail({ ...row, idempotency_key: "organizer_faster/1" }, { dedupe: true })).toEqual({
    ok: false,
    error: "email_queue_enqueue does not exist",
  });
  expect(insert).not.toHaveBeenCalled();
});
