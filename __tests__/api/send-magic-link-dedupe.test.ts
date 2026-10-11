/**
 * @jest-environment node
 */
jest.mock("botid/server", () => ({ checkBotId: jest.fn().mockResolvedValue({ isBot: false }) }));
jest.mock("@/lib/rate-limit", () => ({
  consumeActionRate: jest.fn().mockResolvedValue({ allowed: true }),
}));
jest.mock("@/lib/email-send", () => ({ consumeEmailKeyRate: jest.fn() }));
const generateLink = jest.fn();
jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: () => ({ auth: { admin: { generateLink } } }),
}));
const emailsSend = jest.fn().mockResolvedValue({ error: null });
jest.mock("@/lib/resend-for-brand", () => ({
  getResendForBrand: () => ({ emails: { send: emailsSend } }),
}));
jest.mock("@/lib/posthog-server", () => ({ getPostHogClient: () => ({ capture: jest.fn() }) }));

import { NextRequest } from "next/server";
import { consumeEmailKeyRate } from "@/lib/email-send";
import { POST } from "@/app/api/auth/send-magic-link/route";

const consume = consumeEmailKeyRate as jest.Mock;

function req(email: string) {
  return new NextRequest("https://wardsignup.com/api/auth/send-magic-link", {
    method: "POST",
    headers: { "content-type": "application/json", host: "wardsignup.com", origin: "https://wardsignup.com" },
    body: JSON.stringify({ email }),
  });
}

beforeEach(() => {
  consume.mockReset();
  emailsSend.mockClear();
  generateLink.mockReset();
  generateLink.mockResolvedValue({ data: { properties: { hashed_token: "h" } }, error: null });
});

it("returns success without sending when a link went out in the last 5 minutes", async () => {
  consume.mockImplementation(async (action: string) => action !== "magic_link_dedupe");
  const res = await POST(req("  Ky@Example.com "));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, alreadySent: true });
  expect(consume).toHaveBeenCalledWith("magic_link_dedupe", "magic-link:ky@example.com", 1, expect.any(Date));
  expect(emailsSend).not.toHaveBeenCalled();
  expect(generateLink).not.toHaveBeenCalled();
});

it("sends to the normalized address on the first request", async () => {
  consume.mockResolvedValue(true);
  const res = await POST(req("Ky@Example.com"));
  expect(res.status).toBe(200);
  expect(emailsSend).toHaveBeenCalledTimes(1);
  expect(emailsSend.mock.calls[0][0].to).toBe("ky@example.com");
});
