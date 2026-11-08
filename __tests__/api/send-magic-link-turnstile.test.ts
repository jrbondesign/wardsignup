/**
 * @jest-environment node
 */
jest.mock("botid/server", () => ({ checkBotId: jest.fn().mockResolvedValue({ isBot: false }) }));
const consumeActionRate = jest.fn().mockResolvedValue({ allowed: true });
jest.mock("@/lib/rate-limit", () => ({ consumeActionRate: (...a: unknown[]) => consumeActionRate(...a) }));
jest.mock("@/lib/email-send", () => ({
  consumeEmailKeyRate: jest.fn().mockResolvedValue(true),
  consumeOwnedEmailSlot: jest.fn().mockResolvedValue(true),
  releaseOwnedEmailSlot: jest.fn().mockResolvedValue(true),
}));
const generateLink = jest.fn();
jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: () => ({ auth: { admin: { generateLink } }, rpc: jest.fn().mockResolvedValue({ data: true, error: null }) }),
}));
const emailsSend = jest.fn().mockResolvedValue({ error: null });
jest.mock("@/lib/resend-for-brand", () => ({
  getResendForBrand: () => ({ emails: { send: emailsSend } }),
}));
jest.mock("@/lib/posthog-server", () => ({ getPostHogClient: () => ({ capture: jest.fn() }) }));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/send-magic-link/route";
import { TURNSTILE_SITEVERIFY_URL } from "@/lib/turnstile";

const saved = { ...process.env };
const realFetch = global.fetch;
let siteverify: jest.Mock;

function req(body: Record<string, unknown>) {
  return new NextRequest("https://wardsignup.com/api/auth/send-magic-link", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "wardsignup.com",
      origin: "https://wardsignup.com",
      "x-vercel-forwarded-for": "203.0.113.7",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env = { ...saved };
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
  emailsSend.mockClear();
  consumeActionRate.mockClear();
  generateLink.mockReset();
  generateLink.mockResolvedValue({ data: { properties: { hashed_token: "h" } }, error: null });
  siteverify = jest.fn();
  global.fetch = jest.fn((url: unknown, init?: unknown) => {
    if (url === TURNSTILE_SITEVERIFY_URL) return siteverify(url, init);
    return Promise.reject(new Error(`unexpected fetch ${String(url)}`));
  }) as unknown as typeof fetch;
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "info").mockImplementation(() => {});
});
afterAll(() => {
  process.env = saved;
  global.fetch = realFetch;
});

it("without Turnstile keys nothing changes: no token needed, Cloudflare never called", async () => {
  const res = await POST(req({ email: "new@example.com" }));
  expect(res.status).toBe(200);
  expect(siteverify).not.toHaveBeenCalled();
  expect(generateLink).toHaveBeenCalledTimes(1);
});

describe("with Turnstile keys", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site";
    process.env.TURNSTILE_SECRET_KEY = "secret";
  });

  it("a request with no token is refused before any rate limit, link or account", async () => {
    const res = await POST(req({ email: "bot@example.com" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ captcha: true });
    expect(consumeActionRate).not.toHaveBeenCalled();
    expect(generateLink).not.toHaveBeenCalled();
    expect(emailsSend).not.toHaveBeenCalled();
  });

  it("a token Cloudflare rejects is refused", async () => {
    siteverify.mockResolvedValue({ status: 200, json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }) });
    const res = await POST(req({ email: "bot@example.com", captchaToken: "forged" }));
    expect(res.status).toBe(403);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("a valid token goes through and is checked with the client IP", async () => {
    siteverify.mockResolvedValue({ status: 200, json: async () => ({ success: true }) });
    const res = await POST(req({ email: "person@example.com", captchaToken: "tok" }));
    expect(res.status).toBe(200);
    expect(JSON.parse(siteverify.mock.calls[0][1].body)).toEqual({ secret: "secret", response: "tok", remoteip: "203.0.113.7" });
    expect(generateLink).toHaveBeenCalledTimes(1);
    expect(emailsSend).toHaveBeenCalledTimes(1);
  });
});
