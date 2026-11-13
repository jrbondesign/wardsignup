/**
 * @jest-environment node
 */

// Turnstile on the public signup routes: /api/signups/bulk (the event page
// form), /api/signups and /api/item-signups. Verified before the signup rate
// limit and before create_signup_if_capacity / create_item_signup_if_capacity.

jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  after: () => {},
}));

const capacityRpc = jest.fn();
jest.mock("@/lib/supabase", () => ({
  ...jest.requireActual("@/lib/supabase"),
  createSignupIfCapacityRpc: (...a: unknown[]) => capacityRpc(...a),
}));
jest.mock("@/lib/participant-email", () => ({
  sendParticipantSignupConfirmation: jest.fn().mockResolvedValue({ ok: true }),
  sendParticipantBatchSignupConfirmation: jest.fn().mockResolvedValue({ ok: true }),
}));
jest.mock("@/lib/leader-email", () => ({
  sendLeaderSignupNotification: jest.fn().mockResolvedValue({ ok: true }),
}));
jest.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: jest.fn(), flush: jest.fn().mockResolvedValue(undefined) }),
  captureServerException: jest.fn(),
}));
jest.mock("@/lib/analytics-context", () => ({
  analyticsContextForCampaign: jest.fn().mockResolvedValue({ orgId: null, isTestOrg: null }),
  orgIdForCampaign: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/event-page-cache", () => ({ revalidateEventPage: jest.fn() }));

// Admin client: the rate limit and item RPCs go through adminRpc.
const adminRpc = jest.fn();
function withAbort(value: unknown) {
  const p = Promise.resolve(value);
  const q: { abortSignal: () => unknown; then: typeof p.then } = {
    abortSignal: () => q,
    then: p.then.bind(p),
  };
  return q;
}
const query = () => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "update", "gte", "abortSignal"]) q[m] = () => q;
  q.single = () => Promise.resolve({ data: null, error: null });
  q.maybeSingle = q.single;
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
  return q;
};
jest.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => query(), rpc: (...a: unknown[]) => withAbort(adminRpc(...a)) }),
}));

import { NextRequest } from "next/server";
import { POST as bulkPOST } from "@/app/api/signups/bulk/route";
import { POST as singlePOST } from "@/app/api/signups/route";
import { POST as itemPOST } from "@/app/api/item-signups/route";
import { TURNSTILE_SITEVERIFY_URL } from "@/lib/turnstile";
import { clearSignupRateLimitMemory } from "@/lib/signup-rate-limit";

const saved = { ...process.env };
const realFetch = global.fetch;
let siteverify: jest.Mock;

const routes = [
  {
    name: "/api/signups/bulk",
    post: bulkPOST,
    body: { campaign_id: "c1", session_ids: ["s1"], member_name: "Jane" },
    created: () => capacityRpc,
  },
  {
    name: "/api/signups",
    post: singlePOST,
    body: { campaign_id: "c1", session_id: "s1", member_name: "Jane" },
    created: () => capacityRpc,
  },
  {
    name: "/api/item-signups",
    post: itemPOST,
    body: { campaign_id: "c1", item_id: "i1", member_name: "Jane", quantity: 1 },
    created: () => ({
      mock: { calls: adminRpc.mock.calls.filter((c) => c[0] === "create_item_signup_if_capacity") },
    }),
  },
] as const;

function req(name: string, body: Record<string, unknown>) {
  return new NextRequest(`https://wardsignup.com${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-vercel-forwarded-for": "203.0.113.7" },
    body: JSON.stringify(body),
  });
}
const rateLimitCalls = () => adminRpc.mock.calls.filter((c) => c[0] === "try_consume_signup_rate").length;

beforeEach(() => {
  clearSignupRateLimitMemory();
  jest.clearAllMocks();
  process.env = { ...saved, SUPABASE_SERVICE_ROLE_KEY: "svc", NEXT_PUBLIC_SUPABASE_URL: "http://sb" };
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
  adminRpc.mockImplementation((name: string) =>
    Promise.resolve(
      name === "create_item_signup_if_capacity"
        ? { data: { id: "is-1", campaign_id: "c1", member_name: "Jane", quantity: 1 }, error: null }
        : { data: true, error: null },
    ),
  );
  capacityRpc.mockResolvedValue({ data: { id: "sig-1", cancel_token: "tok-1" }, error: null });
  siteverify = jest.fn();
  global.fetch = jest.fn((url: unknown, init?: unknown) => {
    if (url === TURNSTILE_SITEVERIFY_URL) return siteverify(url, init);
    return Promise.reject(new Error(`unexpected fetch ${String(url)}`));
  }) as unknown as typeof fetch;
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  process.env = saved;
  global.fetch = realFetch;
});

function keysOn() {
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site";
  process.env.TURNSTILE_SECRET_KEY = "secret";
}

describe.each(routes)("$name", (route) => {
  it("without Turnstile keys nothing changes: no token needed, Cloudflare never called", async () => {
    const res = await route.post(req(route.name, { ...route.body }));
    expect(res.status).toBe(200);
    expect(siteverify).not.toHaveBeenCalled();
    expect(route.created().mock.calls.length).toBe(1);
  });

  it("only the site key set (no secret) still needs no token", async () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site";
    const res = await route.post(req(route.name, { ...route.body }));
    expect(res.status).toBe(200);
    expect(siteverify).not.toHaveBeenCalled();
  });

  it("with keys, a missing token is refused before the rate limit and the signup RPC", async () => {
    keysOn();
    const res = await route.post(req(route.name, { ...route.body }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.captcha).toBe(true);
    expect(json.error).toMatch(/security check/);
    expect(json.error).not.toMatch(/[\u2013\u2014]/);
    expect(siteverify).not.toHaveBeenCalled();
    expect(rateLimitCalls()).toBe(0);
    expect(route.created().mock.calls.length).toBe(0);
  });

  it("with keys, a token Cloudflare rejects is refused and no signup is made", async () => {
    keysOn();
    siteverify.mockResolvedValue({
      status: 200,
      json: async () => ({ success: false, "error-codes": ["timeout-or-duplicate"] }),
    });
    const res = await route.post(req(route.name, { ...route.body, captchaToken: "used" }));
    expect(res.status).toBe(403);
    expect((await res.json()).captcha).toBe(true);
    expect(rateLimitCalls()).toBe(0);
    expect(route.created().mock.calls.length).toBe(0);
  });

  it("with keys, a good token signs up and sends the secret and IP to siteverify", async () => {
    keysOn();
    siteverify.mockResolvedValue({ status: 200, json: async () => ({ success: true }) });
    const res = await route.post(req(route.name, { ...route.body, captchaToken: "good" }));
    expect(res.status).toBe(200);
    const sent = JSON.parse((siteverify.mock.calls[0][1] as { body: string }).body);
    expect(sent).toEqual({ secret: "secret", response: "good", remoteip: "203.0.113.7" });
    expect(route.created().mock.calls.length).toBe(1);
  });

  it("fails open when Cloudflare siteverify is down (5xx), and logs it", async () => {
    keysOn();
    siteverify.mockResolvedValue({ status: 503, json: async () => ({}) });
    const res = await route.post(req(route.name, { ...route.body, captchaToken: "t" }));
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("turnstile siteverify 503"));
    expect(route.created().mock.calls.length).toBe(1);
  });

  it("fails open when Cloudflare siteverify is unreachable (network error)", async () => {
    keysOn();
    siteverify.mockRejectedValue(new Error("ECONNRESET"));
    const res = await route.post(req(route.name, { ...route.body, captchaToken: "t" }));
    expect(res.status).toBe(200);
    expect(route.created().mock.calls.length).toBe(1);
  });

  it("with keys, a forged or garbage token (invalid-input-response) is refused before the rate limit and the signup RPC", async () => {
    keysOn();
    siteverify.mockResolvedValue({
      status: 200,
      json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }),
    });
    const res = await route.post(req(route.name, { ...route.body, captchaToken: "forged" }));
    expect(res.status).toBe(403);
    expect((await res.json()).captcha).toBe(true);
    expect(rateLimitCalls()).toBe(0);
    expect(route.created().mock.calls.length).toBe(0);
  });

  it("fails open when siteverify times out (aborted request)", async () => {
    keysOn();
    siteverify.mockRejectedValue(Object.assign(new Error("This operation was aborted"), { name: "AbortError" }));
    const res = await route.post(req(route.name, { ...route.body, captchaToken: "t" }));
    expect(res.status).toBe(200);
    expect(route.created().mock.calls.length).toBe(1);
  });

  it("fails open when Cloudflare rate limits us (429) or answers with a non JSON page", async () => {
    keysOn();
    siteverify.mockResolvedValueOnce({ status: 429, json: async () => ({}) });
    expect((await route.post(req(route.name, { ...route.body, captchaToken: "t" }))).status).toBe(200);
    siteverify.mockResolvedValueOnce({ status: 403, json: async () => Promise.reject(new SyntaxError("Unexpected token <")) });
    expect((await route.post(req(route.name, { ...route.body, captchaToken: "t" }))).status).toBe(200);
    expect(route.created().mock.calls.length).toBe(2);
  });

  it("fails open (and logs it) when our own secret is rejected, so a bad key can't block every signup", async () => {
    keysOn();
    siteverify.mockResolvedValue({
      status: 200,
      json: async () => ({ success: false, "error-codes": ["invalid-input-secret"] }),
    });
    const res = await route.post(req(route.name, { ...route.body, captchaToken: "t" }));
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("invalid-input-secret"));
    expect(route.created().mock.calls.length).toBe(1);
  });
});
