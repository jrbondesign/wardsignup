const rpc = jest.fn();
jest.mock("@/lib/supabase-admin", () => ({ createServiceRoleClient: () => ({ rpc }) }));
const resendSend = jest.fn();
jest.mock("@/lib/resend-for-brand", () => ({
  getResendForBrand: () => ({ emails: { send: resendSend } }),
}));

import { brevoConfig, deliverEmail, parseFrom, sendViaBrevo } from "@/lib/email-deliver";

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
