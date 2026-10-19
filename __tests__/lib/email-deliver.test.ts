const rpc = jest.fn();
jest.mock("@/lib/supabase-admin", () => ({ createServiceRoleClient: () => ({ rpc }) }));
const resendSend = jest.fn();
jest.mock("@/lib/resend-for-brand", () => ({
  getResendForBrand: () => ({ emails: { send: resendSend } }),
}));

import { brevoConfig, deliverEmail, parseFrom, resendUtcDayCap, sendViaBrevo } from "@/lib/email-deliver";

const brand = { id: "wardsignup", name: "Ward Signup" } as never;
const msg = { brand, from: "Ward Signup <noreply@wardsignup.com>", to: "a@b.com", subject: "S", html: "<p>h</p>" };
const BREVO_ENV = {
  EMAIL_FALLBACK_PROVIDER: "brevo",
  BREVO_API_KEY: "k",
  BREVO_SENDER_EMAIL: "noreply@wardsignup.com",
  BREVO_SENDER_NAME: "Ward Signup",
};
const saved = { ...process.env };

beforeEach(() => {
  rpc.mockReset();
  resendSend.mockReset();
  process.env = { ...saved };
  (global as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => "" });
});
afterAll(() => {
  process.env = saved;
});

it("brevo stays off until all env vars are set", () => {
  expect(brevoConfig({})).toBeNull();
  expect(brevoConfig({ ...BREVO_ENV, EMAIL_FALLBACK_PROVIDER: "" })).toBeNull();
  expect(brevoConfig({ ...BREVO_ENV, BREVO_API_KEY: "" })).toBeNull();
  expect(brevoConfig(BREVO_ENV)).toEqual({ apiKey: "k", senderEmail: "noreply@wardsignup.com", senderName: "Ward Signup" });
});

it("parses from addresses", () => {
  expect(parseFrom("Jonathan <jonathan@wardsignup.com>")).toEqual({ name: "Jonathan", email: "jonathan@wardsignup.com" });
  expect(parseFrom("x@y.com")).toEqual({ name: null, email: "x@y.com" });
});

it("sends the Brevo payload", async () => {
  const f = jest.fn().mockResolvedValue({ ok: true, text: async () => "" });
  const r = await sendViaBrevo(msg, { apiKey: "k", senderEmail: "noreply@wardsignup.com", senderName: null }, f as never);
  expect(r).toEqual({ ok: true, provider: "brevo" });
  const [url, init] = f.mock.calls[0];
  expect(url).toBe("https://api.brevo.com/v3/smtp/email");
  expect(init.headers["api-key"]).toBe("k");
  const body = JSON.parse(init.body);
  expect(body.sender).toEqual({ email: "noreply@wardsignup.com", name: "Ward Signup" });
  expect(body.to).toEqual([{ email: "a@b.com" }]);
});

it("uses Resend while under the soft limit", async () => {
  Object.assign(process.env, BREVO_ENV);
  rpc.mockResolvedValue({ data: true, error: null });
  resendSend.mockResolvedValue({ error: null });
  expect(await deliverEmail(msg, { urgent: true })).toEqual({ ok: true, provider: "resend" });
  expect(global.fetch).not.toHaveBeenCalled();
});

it("sends urgent mail through Brevo once the soft limit is reached", async () => {
  Object.assign(process.env, BREVO_ENV);
  rpc.mockResolvedValue({ data: false, error: null });
  expect(await deliverEmail(msg, { urgent: true })).toEqual({ ok: true, provider: "brevo" });
  expect(resendSend).not.toHaveBeenCalled();
});

it("hands non urgent mail back as over budget so it can be queued", async () => {
  Object.assign(process.env, BREVO_ENV);
  rpc.mockResolvedValue({ data: false, error: null });
  const r = await deliverEmail(msg, { urgent: false });
  expect(r).toMatchObject({ ok: false, overBudget: true });
  expect(global.fetch).not.toHaveBeenCalled();
});

it("falls back to Brevo when Resend answers 429", async () => {
  Object.assign(process.env, BREVO_ENV);
  rpc.mockResolvedValue({ data: true, error: null });
  resendSend.mockResolvedValue({ error: { statusCode: 429, name: "daily_quota_exceeded", message: "quota" } });
  expect(await deliverEmail(msg, { urgent: true })).toEqual({ ok: true, provider: "brevo" });
});

it("does nothing extra when Brevo is not configured", async () => {
  rpc.mockResolvedValue({ data: false, error: null });
  resendSend.mockResolvedValue({ error: null });
  expect(await deliverEmail(msg, { urgent: true })).toEqual({ ok: true, provider: "resend" });
  expect(global.fetch).not.toHaveBeenCalled();
});

describe("Arizona day budget plus UTC day safety cap", () => {
  const callsFor = (action: string) =>
    rpc.mock.calls.filter((c) => (c[1] as { p_action: string }).p_action === action).map((c) => c[1] as Record<string, unknown>);
  afterEach(() => jest.useRealTimers());

  it("counts each Resend send on both counters: UTC day and Arizona day buckets", async () => {
    jest.useFakeTimers();
    // 6:30 PM Arizona Oct 12 = 01:30Z Oct 13: Arizona day Oct 12, Resend day Oct 13
    jest.setSystemTime(new Date("2026-10-13T01:30:00Z"));
    rpc.mockResolvedValue({ data: true, error: null });
    resendSend.mockResolvedValue({ error: null });
    expect(await deliverEmail(msg, { urgent: false })).toEqual({ ok: true, provider: "resend" });
    const [utc] = callsFor("email_resend_daily");
    const [phx] = callsFor("email_resend_phx_day");
    expect(utc.p_bucket).toBe("2026-10-13T00:00:00.000Z");
    expect(utc.p_max).toBe(90);
    expect(phx.p_bucket).toBe("2026-10-12T07:00:00.000Z");
    expect(phx.p_max).toBe(90);
    // the UTC cap keeps the counter key the old budget used, so it carries over on deploy
    expect(utc.p_ip_hash).toBe(require("crypto").createHash("sha256").update("resend-daily:wardsignup").digest("hex"));
  });

  it("UTC cap full: refuses without touching the Arizona budget", async () => {
    rpc.mockImplementation((_n: string, a: { p_action: string }) =>
      Promise.resolve({ data: a.p_action !== "email_resend_daily", error: null }),
    );
    const r = await deliverEmail(msg, { urgent: false });
    expect(r).toMatchObject({ ok: false, overBudget: true });
    expect(callsFor("email_resend_phx_day")).toHaveLength(0);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("Arizona budget full: non urgent mail is over budget even with UTC room", async () => {
    rpc.mockImplementation((_n: string, a: { p_action: string }) =>
      Promise.resolve({ data: a.p_action !== "email_resend_phx_day", error: null }),
    );
    expect(await deliverEmail(msg, { urgent: false })).toMatchObject({ ok: false, overBudget: true });
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("Arizona budget full: urgent mail goes to Brevo", async () => {
    Object.assign(process.env, BREVO_ENV);
    rpc.mockImplementation((_n: string, a: { p_action: string }) =>
      Promise.resolve({ data: a.p_action !== "email_resend_phx_day", error: null }),
    );
    expect(await deliverEmail(msg, { urgent: true })).toEqual({ ok: true, provider: "brevo" });
  });

  it("counter errors fail open to Resend (Resend's 429 is the backstop)", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "db down" } });
    resendSend.mockResolvedValue({ error: null });
    expect(await deliverEmail(msg, { urgent: false })).toEqual({ ok: true, provider: "resend" });
  });

  it("cap defaults to the soft limit and never goes above Resend's 100", () => {
    expect(resendUtcDayCap({})).toBe(90);
    expect(resendUtcDayCap({ RESEND_DAILY_SOFT_LIMIT: "80" })).toBe(80);
    expect(resendUtcDayCap({ RESEND_UTC_DAY_CAP: "95" })).toBe(95);
    expect(resendUtcDayCap({ RESEND_UTC_DAY_CAP: "500" })).toBe(100);
  });

  describe("near real time mail (welcome)", () => {
    it("sends on Resend when both counters have room", async () => {
      Object.assign(process.env, BREVO_ENV);
      rpc.mockResolvedValue({ data: true, error: null });
      resendSend.mockResolvedValue({ error: null });
      expect(await deliverEmail(msg, { urgent: false, realtime: true })).toEqual({ ok: true, provider: "resend" });
      expect(callsFor("email_resend_daily")).toHaveLength(1);
      expect(callsFor("email_resend_phx_day")).toHaveLength(1);
    });

    it("Arizona budget full: goes to Brevo right away", async () => {
      Object.assign(process.env, BREVO_ENV);
      rpc.mockImplementation((_n: string, a: { p_action: string }) =>
        Promise.resolve({ data: a.p_action !== "email_resend_phx_day", error: null }),
      );
      expect(await deliverEmail(msg, { urgent: false, realtime: true })).toEqual({ ok: true, provider: "brevo" });
      expect(resendSend).not.toHaveBeenCalled();
    });

    it("UTC cap full: goes to Brevo right away", async () => {
      Object.assign(process.env, BREVO_ENV);
      rpc.mockImplementation((_n: string, a: { p_action: string }) =>
        Promise.resolve({ data: a.p_action !== "email_resend_daily", error: null }),
      );
      expect(await deliverEmail(msg, { urgent: false, realtime: true })).toEqual({ ok: true, provider: "brevo" });
      expect(resendSend).not.toHaveBeenCalled();
    });

    it("budget full and no Brevo: over budget (never pushes past our caps on Resend, unlike urgent)", async () => {
      rpc.mockResolvedValue({ data: false, error: null });
      expect(await deliverEmail(msg, { urgent: false, realtime: true })).toMatchObject({ ok: false, overBudget: true });
      expect(resendSend).not.toHaveBeenCalled();
    });

    it("Resend 429: goes to Brevo", async () => {
      Object.assign(process.env, BREVO_ENV);
      rpc.mockResolvedValue({ data: true, error: null });
      resendSend.mockResolvedValue({ error: { statusCode: 429, name: "daily_quota_exceeded", message: "quota" } });
      expect(await deliverEmail(msg, { urgent: false, realtime: true })).toEqual({ ok: true, provider: "brevo" });
    });
  });
});

describe("Brevo failure is reported so near real time mail can be queued", () => {
  it("realtime: Resend full and Brevo refuses -> brevoFailed", async () => {
    Object.assign(process.env, BREVO_ENV);
    rpc.mockResolvedValue({ data: false, error: null });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    const r = await deliverEmail(msg, { urgent: false, realtime: true });
    expect(r).toMatchObject({ ok: false, brevoFailed: true });
    expect(r).not.toHaveProperty("overBudget");
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("realtime: Resend 429 then Brevo network error -> brevoFailed", async () => {
    Object.assign(process.env, BREVO_ENV);
    rpc.mockResolvedValue({ data: true, error: null });
    resendSend.mockResolvedValue({ error: { statusCode: 429, name: "daily_quota_exceeded", message: "quota" } });
    (global.fetch as jest.Mock).mockRejectedValue(new Error("ECONNRESET"));
    expect(await deliverEmail(msg, { urgent: false, realtime: true })).toMatchObject({ ok: false, brevoFailed: true });
  });

  it("a Resend error that isn't a quota error is not marked brevoFailed", async () => {
    Object.assign(process.env, BREVO_ENV);
    rpc.mockResolvedValue({ data: true, error: null });
    resendSend.mockResolvedValue({ error: { statusCode: 422, name: "validation_error", message: "bad" } });
    const r = await deliverEmail(msg, { urgent: false, realtime: true });
    expect(r).toMatchObject({ ok: false, error: "bad" });
    expect(r).not.toHaveProperty("brevoFailed");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

