/**
 * @jest-environment node
 */
jest.mock("@/lib/rate-limit", () => ({
  consumeActionRate: jest.fn().mockResolvedValue({ allowed: true }),
}));
const consumeEmailKeyRate = jest.fn();
const consumeOwnedEmailSlot = jest.fn();
const releaseOwnedEmailSlot = jest.fn();
jest.mock("@/lib/email-send", () => ({
  consumeEmailKeyRate: (...args: unknown[]) => consumeEmailKeyRate(...args),
  consumeOwnedEmailSlot: (...args: unknown[]) => consumeOwnedEmailSlot(...args),
  releaseOwnedEmailSlot: (...args: unknown[]) => releaseOwnedEmailSlot(...args),
}));
const generateLink = jest.fn();
const rpc = jest.fn();
jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: () => ({
    auth: { admin: { generateLink } },
    rpc,
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.maybeSingle = async () => ({
        data: {
          invited_email: "bishop@example.com",
          organization_id: "org-1",
          organizations: { name: "Test Ward" },
        },
        error: null,
      });
      return chain;
    },
  }),
}));
const deliverEmail = jest.fn();
jest.mock("@/lib/email-deliver", () => {
  const actual = jest.requireActual("@/lib/email-deliver") as {
    retryDeliver: (send: () => Promise<unknown>) => Promise<unknown>;
  };
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
jest.mock("@/lib/posthog-server", () => ({ getPostHogClient: () => ({ capture: jest.fn() }) }));

import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/organizations/invite-magic-link/route";
import { cutoverOperationKey } from "@/lib/email-operation-key";

const tokenHash = createHash("sha256").update("invite-token").digest("hex");

function req() {
  return new NextRequest("https://wardsignup.com/api/organizations/invite-magic-link", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "wardsignup.com",
      "x-forwarded-proto": "https",
    },
    body: JSON.stringify({ token: "invite-token" }),
  });
}

function keyFor(otp: string) {
  return cutoverOperationKey("org_invite", [tokenHash, "bishop@example.com", otp]);
}

beforeEach(() => {
  process.env.EMAIL_PROVIDER_CUTOVER = "brevo";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  consumeEmailKeyRate.mockReset();
  consumeEmailKeyRate.mockResolvedValue(true);
  consumeOwnedEmailSlot.mockReset();
  consumeOwnedEmailSlot.mockResolvedValue(true);
  releaseOwnedEmailSlot.mockReset();
  releaseOwnedEmailSlot.mockResolvedValue(true);
  deliverEmail.mockReset();
  deliverEmail.mockResolvedValue({ ok: true, provider: "brevo" });
  generateLink.mockReset();
  generateLink.mockResolvedValue({ data: { properties: { hashed_token: "otp-one" } }, error: null });
  cutoverBlocksNewLogin.mockReset();
  cutoverBlocksNewLogin.mockResolvedValue(false);
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) => {
    if (name === "email_operation_acquire") return { data: "go", error: null };
    return { data: true, error: null };
  });
});

afterEach(() => {
  delete process.env.EMAIL_PROVIDER_CUTOVER;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

it("does not mint a token while an earlier accept attempt is uncertain", async () => {
  cutoverBlocksNewLogin.mockResolvedValue(true);
  const res = await POST(req());
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, delivery: "unconfirmed" });
  expect(generateLink).not.toHaveBeenCalled();
  expect(deliverEmail).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

it("does not rotate the OTP when another accept request already holds the lease", async () => {
  rpc.mockImplementation(async (name: string) => {
    if (name === "email_operation_acquire") return { data: "busy", error: null };
    return { data: true, error: null };
  });
  const res = await POST(req());
  expect(res.status).toBe(409);
  expect(generateLink).not.toHaveBeenCalled();
  expect(deliverEmail).not.toHaveBeenCalled();
  expect(releaseOwnedEmailSlot).toHaveBeenCalled();
});

it("emails a new OTP after an ambiguous accept, and a replay of that OTP keeps the key", async () => {
  generateLink
    .mockResolvedValueOnce({ data: { properties: { hashed_token: "otp-one" } }, error: null })
    .mockResolvedValueOnce({ data: { properties: { hashed_token: "otp-two" } }, error: null });
  deliverEmail
    .mockResolvedValueOnce({ ok: false, error: "timed out", ambiguous: true })
    .mockResolvedValueOnce({ ok: false, error: "Brevo rate limited", retryable: true })
    .mockResolvedValueOnce({ ok: true, provider: "brevo" });

  const first = await POST(req());
  expect(first.status).toBe(200);
  expect(await first.json()).toEqual({ ok: true, delivery: "unconfirmed" });
  expect(deliverEmail.mock.calls[0][0].idempotencyKey).toBe(keyFor("otp-one"));
  expect(deliverEmail.mock.calls[0][0].operationScope).toBe(`invite:${tokenHash}`);
  expect(deliverEmail.mock.calls[0][0].idempotencyKey).not.toBe(
    cutoverOperationKey("org_member_invite", ["org-1", "bishop@example.com", tokenHash]),
  );

  const second = await POST(req());
  expect(second.status).toBe(200);
  expect(await second.json()).toEqual({ ok: true });
  expect(generateLink).toHaveBeenCalledTimes(2);
  expect(deliverEmail.mock.calls[1][0].idempotencyKey).toBe(keyFor("otp-two"));
  expect(deliverEmail.mock.calls[2][0].idempotencyKey).toBe(keyFor("otp-two"));
  expect(String(deliverEmail.mock.calls[2][0].html)).toContain("otp-two");
});

it("lets only one of two concurrent accept requests call generateLink", async () => {
  let held = false;
  rpc.mockImplementation(async (name: string) => {
    if (name === "email_operation_acquire") {
      if (held) return { data: "busy", error: null };
      held = true;
      return { data: "go", error: null };
    }
    return { data: true, error: null };
  });
  const [a, b] = await Promise.all([POST(req()), POST(req())]);
  const statuses = [a.status, b.status].sort();
  expect(statuses).toEqual([200, 409]);
  expect(generateLink).toHaveBeenCalledTimes(1);
  expect(deliverEmail).toHaveBeenCalledTimes(1);
});
