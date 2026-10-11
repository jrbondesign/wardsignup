const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: () => ({
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));
jest.mock("@/lib/resend-for-brand", () => ({ getResendForBrand: () => ({ emails: { send: jest.fn() } }) }));
const deliverEmail = jest.fn();
jest.mock("@/lib/email-deliver", () => ({ deliverEmail: (...a: unknown[]) => deliverEmail(...a), brevoConfig: () => null }));
const enqueueEmail = jest.fn().mockResolvedValue({ ok: true });
jest.mock("@/lib/email-queue", () => ({ enqueueEmail: (...a: unknown[]) => enqueueEmail(...a) }));

import { sendGuardedEmail } from "@/lib/email-send";

const brand = { id: "wardsignup", name: "Ward Signup", siteUrl: "https://wardsignup.com" } as never;
const base = { brand, category: "transactional" as const, from: "J <j@wardsignup.com>", to: "A@B.com", subject: "Hi", html: "x" };

beforeEach(() => {
  jest.useFakeTimers();
  deliverEmail.mockReset();
  enqueueEmail.mockClear();
});
afterEach(() => jest.useRealTimers());

it("queues deferrable mail late in the UTC day for 00:05 UTC", async () => {
  jest.setSystemTime(new Date("2026-10-11T15:11:00Z"));
  const r = await sendGuardedEmail({ ...base, deferrable: true, kind: "welcome" });
  expect(r).toEqual({ ok: true, queued: true });
  expect(deliverEmail).not.toHaveBeenCalled();
  expect(enqueueEmail.mock.calls[0][0]).toMatchObject({
    kind: "welcome",
    to_address: "a@b.com",
    send_after: "2026-10-12T00:05:00.000Z",
  });
});

it("sends deferrable mail right away just after the reset", async () => {
  jest.setSystemTime(new Date("2026-10-12T00:05:00Z"));
  deliverEmail.mockResolvedValue({ ok: true, provider: "resend" });
  expect(await sendGuardedEmail({ ...base, deferrable: true })).toEqual({ ok: true });
  expect(enqueueEmail).not.toHaveBeenCalled();
});

it("never queues urgent mail", async () => {
  jest.setSystemTime(new Date("2026-10-11T15:11:00Z"));
  deliverEmail.mockResolvedValue({ ok: true, provider: "brevo" });
  expect(await sendGuardedEmail({ ...base, urgent: true })).toEqual({ ok: true });
  expect(deliverEmail.mock.calls[0][1]).toEqual({ urgent: true });
  expect(enqueueEmail).not.toHaveBeenCalled();
});

it("queues non urgent mail when Resend is over budget", async () => {
  jest.setSystemTime(new Date("2026-10-11T18:00:00Z"));
  deliverEmail.mockResolvedValue({ ok: false, error: "limit", overBudget: true });
  expect(await sendGuardedEmail({ ...base })).toEqual({ ok: true, queued: true });
});

it("does not requeue rows the drain is sending", async () => {
  jest.setSystemTime(new Date("2026-10-11T18:00:00Z"));
  deliverEmail.mockResolvedValue({ ok: false, error: "limit", overBudget: true });
  const r = await sendGuardedEmail({ ...base, deferrable: true, fromQueue: true });
  expect(r).toMatchObject({ ok: false, overBudget: true });
  expect(enqueueEmail).not.toHaveBeenCalled();
});
