const rpc = jest.fn();
jest.mock("@/lib/supabase-admin", () => ({ createServiceRoleClient: () => ({ rpc }) }));
const resendSend = jest.fn();
jest.mock("@/lib/resend-for-brand", () => ({
  getResendForBrand: () => ({ emails: { send: resendSend } }),
}));

const capture = jest.fn();
jest.mock("@/lib/posthog-server", () => ({ getPostHogClient: () => ({ capture }) }));

import {
  brevoConfig,
  bulkProvider,
  classifyResendError,
  isBulkKind,
  deliverEmail,
  failoverAlertTo,
  parseFrom,
  resendUtcDayCap,
  sendViaBrevo,
} from "@/lib/email-deliver";

const brand = { id: "wardsignup", name: "Ward Signup", email: { organizerFrom: "Ward Signup <noreply@wardsignup.com>" } } as never;
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
  capture.mockReset();
  process.env = { ...saved, EMAIL_RESEND_RETRY_MS: "0" };
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
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

describe("sender guard", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("brevo stays off when BREVO_SENDER_EMAIL is not @wardsignup.com", () => {
    expect(brevoConfig({ ...BREVO_ENV, BREVO_SENDER_EMAIL: "bondesign@gmail.com" })).toBeNull();
    expect(brevoConfig({ ...BREVO_ENV, BREVO_SENDER_EMAIL: "jonathan@wardsignup.com" })?.senderEmail).toBe("jonathan@wardsignup.com");
  });

  it("Brevo uses the message's noreply@ From even when BREVO_SENDER_EMAIL is jonathan@, with no Reply-To", async () => {
    const f = jest.fn().mockResolvedValue({ ok: true, text: async () => "" });
    const cfg = { apiKey: "k", senderEmail: "jonathan@wardsignup.com", senderName: "Jonathan" };
    await sendViaBrevo(msg, cfg, f as never);
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.sender).toEqual({ email: "noreply@wardsignup.com", name: "Ward Signup" });
    expect(body.replyTo).toBeUndefined();
  });

  it("Brevo passes a Reply-To only when the caller sets one", async () => {
    const f = jest.fn().mockResolvedValue({ ok: true, text: async () => "" });
    const cfg = { apiKey: "k", senderEmail: "noreply@wardsignup.com", senderName: null };
    await sendViaBrevo({ ...msg, from: "Jonathan <jonathan@wardsignup.com>" }, cfg, f as never);
    expect(JSON.parse(f.mock.calls[0][1].body).replyTo).toBeUndefined();
    await sendViaBrevo({ ...msg, replyTo: "leader@example.com" }, cfg, f as never);
    expect(JSON.parse(f.mock.calls[1][1].body).replyTo).toEqual({ email: "leader@example.com" });
  });

  it("sendViaBrevo refuses a gmail From without calling Brevo", async () => {
    const f = jest.fn();
    const r = await sendViaBrevo({ ...msg, from: "PFS <bondesign@gmail.com>" }, { apiKey: "k", senderEmail: "noreply@wardsignup.com", senderName: null }, f as never);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("must be @wardsignup.com"), senderRefused: true });
    expect(f).not.toHaveBeenCalled();
  });

  it("deliverEmail refuses a gmail From before any provider or budget call", async () => {
    Object.assign(process.env, BREVO_ENV);
    for (const opts of [{ urgent: true }, { urgent: false, bulk: true }, { urgent: false, realtime: true }]) {
      const r = await deliverEmail({ ...msg, from: "PFS <bondesign@gmail.com>", kind: "reminder" }, opts);
      expect(r).toEqual({ ok: false, error: expect.stringContaining("must be @wardsignup.com"), senderRefused: true });
    }
    expect(resendSend).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("bulk mail on Brevo goes out as noreply@wardsignup.com", async () => {
    Object.assign(process.env, BREVO_ENV, { BREVO_SENDER_EMAIL: "jonathan@wardsignup.com" });
    const r = await deliverEmail({ ...msg, kind: "reminder" }, { urgent: false });
    expect(r).toEqual({ ok: true, provider: "brevo" });
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.sender.email).toBe("noreply@wardsignup.com");
    expect(body.replyTo).toBeUndefined();
  });
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


describe("failover by Resend failure class", () => {
  const fetchMock = () => global.fetch as unknown as jest.Mock;
  const brevoBodies = () => fetchMock().mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body));
  /** Brevo sends for the email itself, leaving out the founder alert. */
  const brevoSendsTo = (to: string) => brevoBodies().filter((b) => b.to[0].email === to);
  const roomOnResend = () =>
    rpc.mockImplementation((_n: string, a: { p_action: string }) =>
      Promise.resolve({ data: a.p_action !== "email_failover_alert" ? true : false, error: null }),
    );

  beforeEach(() => {
    Object.assign(process.env, BREVO_ENV);
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("classifies Resend errors", () => {
    expect(classifyResendError({ statusCode: 429, name: "daily_quota_exceeded" })).toBe("quota");
    expect(classifyResendError({ statusCode: 429, name: "rate_limit_exceeded" })).toBe("quota");
    expect(classifyResendError({ statusCode: 429, name: "monthly_quota_exceeded" })).toBe("quota");
    expect(classifyResendError({ statusCode: 500, name: "application_error" })).toBe("transient");
    expect(classifyResendError({ statusCode: 503, name: "service_unavailable" })).toBe("transient");
    expect(classifyResendError({ statusCode: null, name: "application_error" })).toBe("transient");
    expect(classifyResendError({ statusCode: 401, name: "validation_error", message: "API key is invalid" })).toBe("auth");
    expect(classifyResendError({ statusCode: 403, name: "suspended_api_key" })).toBe("auth");
    expect(classifyResendError({ statusCode: 409, name: "concurrent_idempotent_requests" })).toBe("in_progress");
    expect(classifyResendError({ statusCode: 422, name: "missing_required_field" })).toBe("permanent");
    expect(classifyResendError({ statusCode: 400, name: "validation_error" })).toBe("permanent");
    expect(classifyResendError({ statusCode: 403, name: "validation_error", message: "The x.com domain is not verified" })).toBe("permanent");
    expect(classifyResendError({ statusCode: 409, name: "invalid_idempotent_request" })).toBe("permanent");
  });

  it("5xx once: retries Resend with the same Idempotency-Key and never touches Brevo", async () => {
    roomOnResend();
    resendSend
      .mockResolvedValueOnce({ error: { statusCode: 500, name: "application_error", message: "boom" } })
      .mockResolvedValueOnce({ error: null });
    expect(await deliverEmail(msg, { urgent: false })).toEqual({ ok: true, provider: "resend" });
    expect(resendSend).toHaveBeenCalledTimes(2);
    const k1 = resendSend.mock.calls[0][1].idempotencyKey;
    expect(k1).toEqual(expect.any(String));
    expect(resendSend.mock.calls[1][1].idempotencyKey).toBe(k1);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("5xx twice: the same email goes through Brevo, batch mail included", async () => {
    roomOnResend();
    resendSend.mockResolvedValue({ error: { statusCode: 503, name: "service_unavailable", message: "down" } });
    expect(await deliverEmail({ ...msg, idempotencyKey: "email-queue/1" }, { urgent: false })).toEqual({
      ok: true,
      provider: "brevo",
    });
    const [sent] = brevoSendsTo("a@b.com");
    expect(sent.subject).toBe("S");
    expect(sent.htmlContent).toBe("<p>h</p>");
    expect(sent.headers.IdempotencyKey).toBe("email-queue/1");
    expect(resendSend.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(["email-queue/1", "email-queue/1"]);
  });

  it("network error (no response) twice: Brevo", async () => {
    roomOnResend();
    resendSend.mockResolvedValue({ error: { statusCode: null, name: "application_error", message: "Unable to fetch data." } });
    expect(await deliverEmail(msg, { urgent: true })).toEqual({ ok: true, provider: "brevo" });
    expect(brevoSendsTo("a@b.com")).toHaveLength(1);
  });

  it("validation errors never fail over", async () => {
    roomOnResend();
    resendSend.mockResolvedValue({ error: { statusCode: 422, name: "missing_required_field", message: "missing to" } });
    expect(await deliverEmail(msg, { urgent: true })).toEqual({ ok: false, error: "missing to" });
    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(fetchMock()).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it("an idempotent request still in progress is never handed to Brevo (it may already be sending)", async () => {
    roomOnResend();
    resendSend.mockResolvedValue({ error: { statusCode: 409, name: "concurrent_idempotent_requests", message: "in progress" } });
    expect(await deliverEmail(msg, { urgent: true })).toMatchObject({ ok: false });
    expect(resendSend).toHaveBeenCalledTimes(2);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("an invalid or suspended Resend key fails over", async () => {
    roomOnResend();
    resendSend.mockResolvedValue({ error: { statusCode: 401, name: "validation_error", message: "API key is invalid" } });
    expect(await deliverEmail(msg, { urgent: false })).toEqual({ ok: true, provider: "brevo" });
    expect(resendSend).toHaveBeenCalledTimes(1);
  });

  it("quota on batch mail still waits for the queue instead of using Brevo", async () => {
    roomOnResend();
    resendSend.mockResolvedValue({ error: { statusCode: 429, name: "daily_quota_exceeded", message: "quota" } });
    expect(await deliverEmail(msg, { urgent: false })).toMatchObject({ ok: false, overBudget: true });
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("no Brevo configured: a 5xx is reported, nothing else is tried", async () => {
    for (const k of Object.keys(BREVO_ENV)) delete process.env[k];
    roomOnResend();
    resendSend.mockResolvedValue({ error: { statusCode: 500, name: "application_error", message: "boom" } });
    expect(await deliverEmail(msg, { urgent: true })).toEqual({ ok: false, error: "boom" });
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("Brevo failing after a 5xx is reported as brevoFailed", async () => {
    roomOnResend();
    resendSend.mockResolvedValue({ error: { statusCode: 500, name: "application_error", message: "boom" } });
    (global as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({ ok: false, status: 502, text: async () => "bad" });
    expect(await deliverEmail(msg, { urgent: true })).toMatchObject({ ok: false, brevoFailed: true });
  });

  describe("failover alert", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
      resendSend.mockResolvedValue({ error: { statusCode: 500, name: "application_error", message: "boom" } });
    });

    it("first failover of the Arizona day: PostHog event plus one alert email to the founder", async () => {
      rpc.mockResolvedValue({ data: true, error: null });
      await deliverEmail({ ...msg, kind: "magic_link" }, { urgent: true });
      expect(capture).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "email_failover",
          properties: { brand_id: "wardsignup", kind: "magic_link", reason: "transient", provider: "brevo" },
        }),
      );
      expect(JSON.stringify(capture.mock.calls)).not.toContain("a@b.com");
      const alerts = brevoSendsTo("jonathan@wardsignup.com");
      expect(alerts).toHaveLength(1);
      expect(alerts[0].subject).toContain("failover");
      expect(alerts[0].sender.email).toBe("noreply@wardsignup.com");
      expect(JSON.stringify(alerts[0])).not.toContain("a@b.com");
      const alertRate = rpc.mock.calls.find((c) => c[1].p_action === "email_failover_alert")![1];
      expect(alertRate.p_max).toBe(1);
    });

    it("later failovers that day: event only, no second alert", async () => {
      roomOnResend(); // alert counter full
      await deliverEmail(msg, { urgent: true });
      expect(capture).toHaveBeenCalledTimes(1);
      expect(brevoSendsTo("jonathan@wardsignup.com")).toHaveLength(0);
      expect(brevoSendsTo("a@b.com")).toHaveLength(1);
    });

    it("alert counter error fails closed (no alert storm)", async () => {
      rpc.mockImplementation((_n: string, a: { p_action: string }) =>
        Promise.resolve(a.p_action === "email_failover_alert" ? { data: null, error: { message: "db" } } : { data: true, error: null }),
      );
      expect(await deliverEmail(msg, { urgent: true })).toEqual({ ok: true, provider: "brevo" });
      expect(brevoSendsTo("jonathan@wardsignup.com")).toHaveLength(0);
    });

    it("can be turned off or pointed elsewhere", () => {
      expect(failoverAlertTo({})).toBe("jonathan@wardsignup.com");
      expect(failoverAlertTo({ EMAIL_FAILOVER_ALERT: "off" })).toBeNull();
      expect(failoverAlertTo({ EMAIL_FAILOVER_ALERT_TO: "ops@wardsignup.com" })).toBe("ops@wardsignup.com");
    });
  });
});

describe("routing by email type: bulk mail Brevo first", () => {
  const fetchMock = () => global.fetch as unknown as jest.Mock;
  const brevoBodies = () => fetchMock().mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body));
  const budgetCalls = () =>
    rpc.mock.calls.filter((c) => String((c[1] as { p_action: string }).p_action).startsWith("email_resend_"));
  const roomOnResend = () => rpc.mockResolvedValue({ data: true, error: null });

  it("bulk kinds are reminders, digests and feedback asks; urgent auth and signup mail is not bulk", () => {
    for (const k of ["reminder", "digest", "feedback", "feedback_summary"]) expect(isBulkKind(k)).toBe(true);
    for (const k of ["magic_link", "org_invite", "signup_confirmation", "welcome", "report", undefined, null, ""]) {
      expect(isBulkKind(k)).toBe(false);
    }
  });

  it("bulkProvider: Brevo only when Brevo is configured, and EMAIL_BULK_PROVIDER=resend restores the old behavior", () => {
    expect(bulkProvider({})).toBe("resend");
    expect(bulkProvider({ EMAIL_BULK_PROVIDER: "brevo" })).toBe("resend"); // no Brevo config
    expect(bulkProvider(BREVO_ENV)).toBe("brevo");
    expect(bulkProvider({ ...BREVO_ENV, EMAIL_BULK_PROVIDER: "auto" })).toBe("brevo");
    expect(bulkProvider({ ...BREVO_ENV, EMAIL_BULK_PROVIDER: "brevo" })).toBe("brevo");
    expect(bulkProvider({ ...BREVO_ENV, EMAIL_BULK_PROVIDER: "resend" })).toBe("resend");
    expect(bulkProvider({ ...BREVO_ENV, EMAIL_BULK_PROVIDER: "typo" })).toBe("resend");
  });

  it("reminder with Brevo configured: Brevo first, Resend and its daily budget untouched, no failover alert", async () => {
    Object.assign(process.env, BREVO_ENV, { NEXT_PUBLIC_POSTHOG_KEY: "phc_test" });
    roomOnResend();
    const r = await deliverEmail({ ...msg, kind: "reminder", idempotencyKey: "k-1" }, { urgent: true });
    expect(r).toEqual({ ok: true, provider: "brevo" });
    expect(resendSend).not.toHaveBeenCalled();
    expect(budgetCalls()).toHaveLength(0);
    expect(capture).not.toHaveBeenCalled();
    const bodies = brevoBodies();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].to).toEqual([{ email: "a@b.com" }]);
    expect(bodies[0].headers.IdempotencyKey).toBe("k-1");
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("provider=brevo brand=wardsignup kind=reminder route=bulk"));
  });

  it("queued digest drained with Brevo configured goes to Brevo with the queue row key", async () => {
    Object.assign(process.env, BREVO_ENV);
    roomOnResend();
    expect(await deliverEmail({ ...msg, kind: "digest", idempotencyKey: "email-queue/9" }, { urgent: false })).toEqual({
      ok: true,
      provider: "brevo",
    });
    expect(resendSend).not.toHaveBeenCalled();
    expect(brevoBodies()[0].headers.IdempotencyKey).toBe("email-queue/9");
  });

  it("reminder without Brevo configured: exactly today's Resend path", async () => {
    roomOnResend();
    resendSend.mockResolvedValue({ error: null });
    expect(await deliverEmail({ ...msg, kind: "reminder" }, { urgent: true })).toEqual({ ok: true, provider: "resend" });
    expect(fetchMock()).not.toHaveBeenCalled();
    expect(budgetCalls()).toHaveLength(2);
  });

  it("EMAIL_BULK_PROVIDER=resend keeps reminders on Resend even with Brevo configured", async () => {
    Object.assign(process.env, BREVO_ENV, { EMAIL_BULK_PROVIDER: "resend" });
    roomOnResend();
    resendSend.mockResolvedValue({ error: null });
    expect(await deliverEmail({ ...msg, kind: "reminder" }, { urgent: true })).toEqual({ ok: true, provider: "resend" });
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("sign in, invite and confirmation mail stays Resend first with Brevo configured", async () => {
    Object.assign(process.env, BREVO_ENV);
    roomOnResend();
    resendSend.mockResolvedValue({ error: null });
    for (const kind of ["magic_link", "org_invite_link", "signup_confirmation"]) {
      expect(await deliverEmail({ ...msg, kind }, { urgent: true })).toEqual({ ok: true, provider: "resend" });
    }
    expect(resendSend).toHaveBeenCalledTimes(3);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("bulk Brevo fails: falls back to Resend with the same idempotency key", async () => {
    Object.assign(process.env, BREVO_ENV);
    roomOnResend();
    fetchMock().mockResolvedValue({ ok: false, status: 402, text: async () => "daily limit" });
    resendSend.mockResolvedValue({ error: null });
    expect(await deliverEmail({ ...msg, kind: "reminder", idempotencyKey: "k-2" }, { urgent: true })).toEqual({
      ok: true,
      provider: "resend",
    });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    expect(resendSend.mock.calls[0][1].idempotencyKey).toBe("k-2");
  });

  it("production env (BREVO_SENDER_EMAIL=jonathan@): a noreply@ reminder Brevo refuses as an unknown sender falls back to Resend from noreply@, never jonathan@", async () => {
    Object.assign(process.env, BREVO_ENV, { BREVO_SENDER_EMAIL: "jonathan@wardsignup.com", BREVO_SENDER_NAME: "" });
    roomOnResend();
    fetchMock().mockResolvedValue({ ok: false, status: 400, text: async () => '{"code":"invalid_parameter","message":"Sender is invalid / inactive"}' });
    resendSend.mockResolvedValue({ error: null });
    expect(await deliverEmail({ ...msg, kind: "reminder" }, { urgent: true })).toEqual({ ok: true, provider: "resend" });
    const b = brevoBodies()[0];
    expect(b.sender).toEqual({ email: "noreply@wardsignup.com", name: "Ward Signup" });
    expect(b.replyTo).toBeUndefined();
    expect(JSON.stringify(b)).not.toContain("jonathan@");
    const r = resendSend.mock.calls[0][0];
    expect(r.from).toBe("Ward Signup <noreply@wardsignup.com>");
    expect(r.replyTo).toBeUndefined();
  });

  it("bulk Brevo fails and Resend is then out of quota: Brevo is not tried a second time", async () => {
    Object.assign(process.env, BREVO_ENV);
    roomOnResend();
    fetchMock().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    resendSend.mockResolvedValue({ error: { statusCode: 429, name: "daily_quota_exceeded", message: "quota" } });
    expect(await deliverEmail({ ...msg, kind: "reminder" }, { urgent: true })).toMatchObject({ ok: false });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("bulk digest: Brevo fails and our Resend budget is full: queued for later like today", async () => {
    Object.assign(process.env, BREVO_ENV);
    rpc.mockResolvedValue({ data: false, error: null });
    fetchMock().mockRejectedValue(new Error("network"));
    expect(await deliverEmail({ ...msg, kind: "digest" }, { urgent: false })).toMatchObject({ ok: false, overBudget: true });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("opts.bulk overrides the kind", async () => {
    Object.assign(process.env, BREVO_ENV);
    roomOnResend();
    resendSend.mockResolvedValue({ error: null });
    expect(await deliverEmail({ ...msg, kind: "reminder" }, { urgent: true, bulk: false })).toEqual({ ok: true, provider: "resend" });
    expect(await deliverEmail({ ...msg, kind: "other" }, { urgent: true, bulk: true })).toEqual({ ok: true, provider: "brevo" });
  });

  it("bulk Brevo network error: falls back to Resend and still sends", async () => {
    Object.assign(process.env, BREVO_ENV);
    roomOnResend();
    fetchMock().mockRejectedValue(new Error("ECONNRESET"));
    resendSend.mockResolvedValue({ error: null });
    expect(await deliverEmail({ ...msg, kind: "feedback" }, { urgent: true })).toEqual({ ok: true, provider: "resend" });
    expect(resendSend).toHaveBeenCalledTimes(1);
  });

  it("bulk Brevo and then Resend both fail with a non quota error: reported as a failure, not a silent success", async () => {
    Object.assign(process.env, BREVO_ENV);
    roomOnResend();
    fetchMock().mockResolvedValue({ ok: false, status: 401, text: async () => "unauthorized" });
    resendSend.mockResolvedValue({ error: { statusCode: 422, name: "validation_error", message: "bad to" } });
    const r = await deliverEmail({ ...msg, kind: "reminder" }, { urgent: true });
    expect(r).toMatchObject({ ok: false });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("EMAIL_BULK_PROVIDER is case and space tolerant, and never moves urgent non bulk mail", async () => {
    expect(bulkProvider({ ...BREVO_ENV, EMAIL_BULK_PROVIDER: " Brevo " })).toBe("brevo");
    expect(bulkProvider({ ...BREVO_ENV, EMAIL_BULK_PROVIDER: "RESEND" })).toBe("resend");
    expect(bulkProvider({ ...BREVO_ENV, EMAIL_BULK_PROVIDER: "" })).toBe("brevo");
    Object.assign(process.env, BREVO_ENV, { EMAIL_BULK_PROVIDER: "brevo" });
    roomOnResend();
    resendSend.mockResolvedValue({ error: null });
    expect(await deliverEmail({ ...msg, kind: "magic_link" }, { urgent: true })).toEqual({ ok: true, provider: "resend" });
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});

describe("Brevo request timeout", () => {
  const cfg = { apiKey: "k", senderEmail: "noreply@wardsignup.com", senderName: "Ward Signup" } as never;
  it("a hung Brevo call is aborted and reported as a failure (so the caller can fall back)", async () => {
    const hung = jest.fn(
      (_u: unknown, init: { signal: AbortSignal }) =>
        new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted")))),
    );
    const r = await sendViaBrevo({ ...msg }, cfg, hung as unknown as typeof fetch, 20);
    expect(r).toEqual({ ok: false, error: "Brevo request failed: timed out after 20ms" });
    expect(hung.mock.calls[0][1].signal).toBeDefined();
  });

  it("the default timeout is 15 seconds", async () => {
    const { BREVO_TIMEOUT_MS } = await import("@/lib/email-deliver");
    expect(BREVO_TIMEOUT_MS).toBe(15_000);
  });
});
