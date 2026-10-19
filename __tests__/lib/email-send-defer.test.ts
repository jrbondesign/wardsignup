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

it("queues deferrable (batch) mail after 6 AM Arizona for 12:05 AM Arizona", async () => {
  // 8:11 AM Arizona Oct 11
  jest.setSystemTime(new Date("2026-10-11T15:11:00Z"));
  const r = await sendGuardedEmail({ ...base, deferrable: true, kind: "digest" });
  expect(r).toEqual({ ok: true, queued: true });
  expect(deliverEmail).not.toHaveBeenCalled();
  expect(enqueueEmail.mock.calls[0][0]).toMatchObject({
    kind: "digest",
    to_address: "a@b.com",
    send_after: "2026-10-12T07:05:00.000Z",
  });
});

it("sends deferrable mail right away early in the Arizona day (5:05 AM digest)", async () => {
  jest.setSystemTime(new Date("2026-10-12T12:05:00Z"));
  deliverEmail.mockResolvedValue({ ok: true, provider: "resend" });
  expect(await sendGuardedEmail({ ...base, deferrable: true })).toEqual({ ok: true });
  expect(enqueueEmail).not.toHaveBeenCalled();
});

it("5:05 PM Arizona (the old UTC reset) is no longer a send window", async () => {
  jest.setSystemTime(new Date("2026-10-12T00:05:00Z"));
  const r = await sendGuardedEmail({ ...base, deferrable: true, kind: "digest" });
  expect(r).toEqual({ ok: true, queued: true });
  expect(enqueueEmail.mock.calls[0][0].send_after).toBe("2026-10-12T07:05:00.000Z");
});

it("never queues urgent mail", async () => {
  jest.setSystemTime(new Date("2026-10-11T15:11:00Z"));
  deliverEmail.mockResolvedValue({ ok: true, provider: "brevo" });
  expect(await sendGuardedEmail({ ...base, urgent: true })).toEqual({ ok: true });
  expect(deliverEmail.mock.calls[0][1]).toEqual({ urgent: true, realtime: false });
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

describe("near real time mail (welcome, new creator, feedback received)", () => {
  // Times across the Arizona day: 12:30 AM, 9 AM, 4:59 PM, 5:01 PM (Resend reset), 11:30 PM
  const times = [
    "2026-10-12T07:30:00Z",
    "2026-10-12T16:00:00Z",
    "2026-10-12T23:59:00Z",
    "2026-10-13T00:01:00Z",
    "2026-10-13T06:30:00Z",
  ];
  it.each(times)("a welcome at %s sends immediately, never held for 12:05 AM", async (t) => {
    jest.setSystemTime(new Date(t));
    deliverEmail.mockResolvedValue({ ok: true, provider: "resend" });
    expect(await sendGuardedEmail({ ...base, realtime: true, kind: "welcome" })).toEqual({ ok: true });
    expect(enqueueEmail).not.toHaveBeenCalled();
    expect(deliverEmail.mock.calls[0][1]).toEqual({ urgent: false, realtime: true });
  });

  it("realtime wins over a stray deferrable flag", async () => {
    jest.setSystemTime(new Date("2026-10-12T16:00:00Z"));
    deliverEmail.mockResolvedValue({ ok: true, provider: "resend" });
    expect(await sendGuardedEmail({ ...base, realtime: true, deferrable: true, kind: "new_creator" })).toEqual({ ok: true });
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it("over budget with no Brevo: queued due now for the hourly drain, not 12:05 AM", async () => {
    // 9:00 AM Arizona
    jest.setSystemTime(new Date("2026-10-12T16:00:00Z"));
    deliverEmail.mockResolvedValue({ ok: false, error: "limit", overBudget: true });
    expect(await sendGuardedEmail({ ...base, realtime: true, kind: "welcome" })).toEqual({ ok: true, queued: true });
    expect(enqueueEmail.mock.calls[0][0]).toMatchObject({ kind: "welcome", send_after: "2026-10-12T16:00:00.000Z" });
  });

  it("still queues (due now) when EMAIL_DEFER_NON_URGENT=off, instead of failing the welcome", async () => {
    const saved = process.env.EMAIL_DEFER_NON_URGENT;
    process.env.EMAIL_DEFER_NON_URGENT = "off";
    try {
      jest.setSystemTime(new Date("2026-10-12T16:00:00Z"));
      deliverEmail.mockResolvedValue({ ok: false, error: "limit", overBudget: true });
      expect(await sendGuardedEmail({ ...base, realtime: true, kind: "welcome" })).toEqual({ ok: true, queued: true });
    } finally {
      process.env.EMAIL_DEFER_NON_URGENT = saved;
    }
  });

  it("urgent mail is unaffected by realtime", async () => {
    jest.setSystemTime(new Date("2026-10-12T16:00:00Z"));
    deliverEmail.mockResolvedValue({ ok: true, provider: "resend" });
    await sendGuardedEmail({ ...base, urgent: true, realtime: true });
    expect(deliverEmail.mock.calls[0][1]).toEqual({ urgent: true, realtime: false });
  });
});
