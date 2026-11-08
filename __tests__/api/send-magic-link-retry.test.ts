/**
 * @jest-environment node
 */
jest.mock("botid/server", () => ({ checkBotId: jest.fn().mockResolvedValue({ isBot: false }) }));
jest.mock("@/lib/rate-limit", () => ({
  consumeActionRate: jest.fn().mockResolvedValue({ allowed: true }),
}));
const consumeEmailKeyRate = jest.fn();
const releaseEmailKeyRate = jest.fn();
jest.mock("@/lib/email-send", () => ({
  consumeEmailKeyRate: (...args: unknown[]) => consumeEmailKeyRate(...args),
  releaseEmailKeyRate: (...args: unknown[]) => releaseEmailKeyRate(...args),
}));
const generateLink = jest.fn();
jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: () => ({ auth: { admin: { generateLink } } }),
}));
const deliverEmail = jest.fn();
jest.mock("@/lib/email-deliver", () => {
  const actual = jest.requireActual("@/lib/email-deliver") as { retryDeliver: (send: () => Promise<unknown>) => Promise<unknown> };
  return {
    deliverEmail: (params: unknown, opts: unknown) => deliverEmail(params, opts),
    hasEmailProviderConfigured: () => true,
    retryDeliver: actual.retryDeliver,
  };
});
const cutoverBlocksNewLogin = jest.fn();
jest.mock("@/lib/email-cutover", () => ({
  cutoverBlocksNewLogin: (...args: unknown[]) => cutoverBlocksNewLogin(...args),
}));
jest.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: jest.fn() }),
  captureServerException: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/send-magic-link/route";

function req() {
  return new NextRequest("https://wardsignup.com/api/auth/send-magic-link", {
    method: "POST",
    headers: { "content-type": "application/json", host: "wardsignup.com", origin: "https://wardsignup.com" },
    body: JSON.stringify({ email: "person@example.com" }),
  });
}

beforeEach(() => {
  process.env.EMAIL_PROVIDER_CUTOVER = "brevo";
  consumeEmailKeyRate.mockReset();
  consumeEmailKeyRate.mockResolvedValue(true);
  releaseEmailKeyRate.mockReset();
  deliverEmail.mockReset();
  generateLink.mockReset();
  generateLink.mockResolvedValue({ data: { properties: { hashed_token: "hashed-token" } }, error: null });
  cutoverBlocksNewLogin.mockReset();
  cutoverBlocksNewLogin.mockResolvedValue(false);
});

afterEach(() => {
  delete process.env.EMAIL_PROVIDER_CUTOVER;
});

it("returns 503 and releases the 5-minute slot when both attempts are rate limited", async () => {
  deliverEmail.mockResolvedValue({ ok: false, error: "Brevo rate limited", retryable: true });
  const res = await POST(req());
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ retryable: true });
  expect(deliverEmail).toHaveBeenCalledTimes(2);
  const key = deliverEmail.mock.calls[0][0].idempotencyKey as string;
  expect(key.startsWith("magic_link/")).toBe(true);
  expect(deliverEmail.mock.calls[1][0].idempotencyKey).toBe(key);
  expect(releaseEmailKeyRate).toHaveBeenCalled();
  const again = await POST(req());
  expect(again.status).toBe(503);
  expect(await again.json()).toMatchObject({ retryable: true });
});

it("keeps the dedupe slot when the provider may already have accepted the link", async () => {
  deliverEmail.mockResolvedValue({ ok: false, error: "timed out", ambiguous: true });
  const res = await POST(req());
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, delivery: "unconfirmed" });
  expect(releaseEmailKeyRate).not.toHaveBeenCalled();
  expect(deliverEmail).toHaveBeenCalledTimes(1);
});

it("does not take the dedupe slot when an earlier attempt is uncertain", async () => {
  cutoverBlocksNewLogin.mockResolvedValue(true);
  const res = await POST(req());
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, delivery: "unconfirmed" });
  expect(consumeEmailKeyRate).not.toHaveBeenCalled();
  expect(deliverEmail).not.toHaveBeenCalled();
});
