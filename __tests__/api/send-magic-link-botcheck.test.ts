/**
 * @jest-environment node
 */
/**
 * Test suite proving bot check enforcement in different environments.
 * CRITICAL: Production must always enforce bot checks, regardless of env vars.
 */

jest.mock("botid/server", () => ({
  checkBotId: jest.fn().mockResolvedValue({ isBot: false }),
}));
jest.mock("@/lib/rate-limit", () => ({
  consumeActionRate: jest.fn().mockResolvedValue({ allowed: true }),
}));
jest.mock("@/lib/email-send", () => ({
  consumeEmailKeyRate: jest.fn().mockResolvedValue(true),
}));
const generateLink = jest.fn();
jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: () => ({ auth: { admin: { generateLink } } }),
}));
const emailsSend = jest.fn().mockResolvedValue({ error: null });
jest.mock("@/lib/resend-for-brand", () => ({
  getResendForBrand: () => ({ emails: { send: emailsSend } }),
}));
jest.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: jest.fn() }),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/send-magic-link/route";
import { checkBotId } from "botid/server";

const mockCheckBotId = checkBotId as jest.Mock;

function req(email: string) {
  return new NextRequest("https://wardsignup.com/api/auth/send-magic-link", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "wardsignup.com",
      origin: "https://wardsignup.com",
    },
    body: JSON.stringify({ email }),
  });
}

beforeEach(() => {
  mockCheckBotId.mockReset();
  mockCheckBotId.mockResolvedValue({ isBot: false });
  emailsSend.mockClear();
  generateLink.mockReset();
  generateLink.mockResolvedValue({
    data: { properties: { hashed_token: "test-hash" } },
    error: null,
  });
  delete process.env.VERCEL_ENV;
  delete process.env.DISABLE_BOTID_FOR_TESTS;
});

describe("Bot check enforcement", () => {
  it("PRODUCTION: always enforces bot check even with DISABLE_BOTID_FOR_TESTS=1", async () => {
    // Production environment with the disable flag set - should still check
    process.env.VERCEL_ENV = "production";
    process.env.DISABLE_BOTID_FOR_TESTS = "1";
    mockCheckBotId.mockResolvedValue({ isBot: true });

    const res = await POST(req("test@example.com"));

    // Bot check must be enforced in production
    expect(mockCheckBotId).toHaveBeenCalled();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "We couldn't verify this request. Please refresh and try again.",
    });
    expect(emailsSend).not.toHaveBeenCalled();
  });

  it("PRODUCTION: blocks bots when detected", async () => {
    process.env.VERCEL_ENV = "production";
    mockCheckBotId.mockResolvedValue({ isBot: true });

    const res = await POST(req("test@example.com"));

    expect(mockCheckBotId).toHaveBeenCalled();
    expect(res.status).toBe(403);
    expect(emailsSend).not.toHaveBeenCalled();
  });

  it("PRODUCTION: allows verified humans", async () => {
    process.env.VERCEL_ENV = "production";
    mockCheckBotId.mockResolvedValue({ isBot: false });

    const res = await POST(req("test@example.com"));

    expect(mockCheckBotId).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(emailsSend).toHaveBeenCalled();
  });

  it("PREVIEW: enforces bot check when DISABLE_BOTID_FOR_TESTS is not set", async () => {
    process.env.VERCEL_ENV = "preview";
    // No DISABLE_BOTID_FOR_TESTS env var
    mockCheckBotId.mockResolvedValue({ isBot: true });

    const res = await POST(req("test@example.com"));

    expect(mockCheckBotId).toHaveBeenCalled();
    expect(res.status).toBe(403);
    expect(emailsSend).not.toHaveBeenCalled();
  });

  it("PREVIEW: enforces bot check when DISABLE_BOTID_FOR_TESTS=0", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.DISABLE_BOTID_FOR_TESTS = "0";
    mockCheckBotId.mockResolvedValue({ isBot: true });

    const res = await POST(req("test@example.com"));

    expect(mockCheckBotId).toHaveBeenCalled();
    expect(res.status).toBe(403);
    expect(emailsSend).not.toHaveBeenCalled();
  });

  it("PREVIEW: skips bot check when DISABLE_BOTID_FOR_TESTS=1", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.DISABLE_BOTID_FOR_TESTS = "1";
    mockCheckBotId.mockResolvedValue({ isBot: true });

    const res = await POST(req("test@example.com"));

    // Bot check should be skipped in preview with flag
    expect(mockCheckBotId).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(emailsSend).toHaveBeenCalled();
  });

  it("DEVELOPMENT: enforces bot check by default", async () => {
    process.env.VERCEL_ENV = "development";
    mockCheckBotId.mockResolvedValue({ isBot: true });

    const res = await POST(req("test@example.com"));

    expect(mockCheckBotId).toHaveBeenCalled();
    expect(res.status).toBe(403);
    expect(emailsSend).not.toHaveBeenCalled();
  });

  it("NO VERCEL_ENV: enforces bot check", async () => {
    // No VERCEL_ENV set at all
    mockCheckBotId.mockResolvedValue({ isBot: true });

    const res = await POST(req("test@example.com"));

    expect(mockCheckBotId).toHaveBeenCalled();
    expect(res.status).toBe(403);
    expect(emailsSend).not.toHaveBeenCalled();
  });
});
