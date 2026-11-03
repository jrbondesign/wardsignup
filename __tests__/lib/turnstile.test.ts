/**
 * @jest-environment node
 */
import { TURNSTILE_SITEVERIFY_URL, turnstileSecret, verifyTurnstile } from "@/lib/turnstile";

const ON = { NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET_KEY: "secret" };
const json = (status: number, body: unknown) => ({ status, json: async () => body }) as unknown as Response;

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

it("is a no-op until both keys are set (secret alone can't lock people out)", async () => {
  const f = jest.fn();
  expect(turnstileSecret({})).toBeNull();
  expect(turnstileSecret({ TURNSTILE_SECRET_KEY: "secret" })).toBeNull();
  expect(turnstileSecret({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site" })).toBeNull();
  expect(await verifyTurnstile(undefined, "1.2.3.4", { env: {}, fetchImpl: f })).toEqual({ ok: true, skipped: "not_configured" });
  expect(await verifyTurnstile(undefined, "1.2.3.4", { env: { TURNSTILE_SECRET_KEY: "s" }, fetchImpl: f })).toMatchObject({ ok: true });
  expect(f).not.toHaveBeenCalled();
});

it("rejects a missing, empty or oversized token without calling Cloudflare", async () => {
  const f = jest.fn();
  for (const t of [undefined, "", "   ", 42, "x".repeat(2049)]) {
    expect(await verifyTurnstile(t, null, { env: ON, fetchImpl: f })).toEqual({ ok: false, reason: "missing_token" });
  }
  expect(f).not.toHaveBeenCalled();
});

it("accepts a token siteverify confirms, sending secret, token and IP", async () => {
  const f = jest.fn().mockResolvedValue(json(200, { success: true }));
  expect(await verifyTurnstile("tok", "1.2.3.4", { env: ON, fetchImpl: f })).toEqual({ ok: true });
  const [url, init] = f.mock.calls[0];
  expect(url).toBe(TURNSTILE_SITEVERIFY_URL);
  expect(JSON.parse(init.body)).toEqual({ secret: "secret", response: "tok", remoteip: "1.2.3.4" });
});

it("omits an unknown IP", async () => {
  const f = jest.fn().mockResolvedValue(json(200, { success: true }));
  await verifyTurnstile("tok", "unknown", { env: ON, fetchImpl: f });
  expect(JSON.parse(f.mock.calls[0][1].body)).not.toHaveProperty("remoteip");
});

it("rejects invalid, expired or replayed tokens", async () => {
  const f = jest.fn().mockResolvedValue(json(200, { success: false, "error-codes": ["timeout-or-duplicate"] }));
  expect(await verifyTurnstile("tok", null, { env: ON, fetchImpl: f })).toEqual({
    ok: false,
    reason: "invalid_token",
    codes: ["timeout-or-duplicate"],
  });
});

it("lets the request through when siteverify itself is down (BotID and rate limits still apply)", async () => {
  expect(await verifyTurnstile("tok", null, { env: ON, fetchImpl: jest.fn().mockRejectedValue(new Error("net")) })).toEqual({
    ok: true,
    skipped: "siteverify_unavailable",
  });
  expect(await verifyTurnstile("tok", null, { env: ON, fetchImpl: jest.fn().mockResolvedValue(json(503, {})) })).toEqual({
    ok: true,
    skipped: "siteverify_unavailable",
  });
  expect(
    await verifyTurnstile("tok", null, {
      env: ON,
      fetchImpl: jest.fn().mockResolvedValue(json(200, { success: false, "error-codes": ["internal-error"] })),
    }),
  ).toEqual({ ok: true, skipped: "siteverify_unavailable" });
});

it("rejects every token code Cloudflare uses for a bad visitor token", async () => {
  for (const code of ["invalid-input-response", "timeout-or-duplicate", "missing-input-response", "bad-request"]) {
    const f = jest.fn().mockResolvedValue(json(200, { success: false, "error-codes": [code] }));
    expect(await verifyTurnstile("tok", null, { env: ON, fetchImpl: f })).toEqual({ ok: false, reason: "invalid_token", codes: [code] });
  }
  // A failure with no codes at all is still a refusal.
  const f = jest.fn().mockResolvedValue(json(200, { success: false }));
  expect(await verifyTurnstile("tok", null, { env: ON, fetchImpl: f })).toEqual({ ok: false, reason: "invalid_token", codes: [] });
});

it("fails open on a real timeout: a hung siteverify is aborted after timeoutMs", async () => {
  const hung = jest.fn(
    (_u: unknown, init: { signal: AbortSignal }) =>
      new Promise<Response>((_res, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted")))),
  );
  const t0 = Date.now();
  expect(await verifyTurnstile("tok", null, { env: ON, fetchImpl: hung as unknown as typeof fetch, timeoutMs: 20 })).toEqual({
    ok: true,
    skipped: "siteverify_unavailable",
  });
  expect(Date.now() - t0).toBeLessThan(2000);
});

it("fails open on 429 and on answers that are not siteverify JSON", async () => {
  const bad = [
    json(429, { success: false }),
    { status: 403, json: async () => Promise.reject(new SyntaxError("Unexpected token <")) } as unknown as Response,
    json(200, null),
    json(200, {}),
    json(200, { success: "yes" }),
  ];
  for (const r of bad) {
    expect(await verifyTurnstile("tok", null, { env: ON, fetchImpl: jest.fn().mockResolvedValue(r) })).toEqual({
      ok: true,
      skipped: "siteverify_unavailable",
    });
  }
});

it("fails open and logs when our own secret is wrong or missing (config error, not the visitor)", async () => {
  for (const code of ["invalid-input-secret", "missing-input-secret"]) {
    const f = jest.fn().mockResolvedValue(json(200, { success: false, "error-codes": [code] }));
    expect(await verifyTurnstile("tok", null, { env: ON, fetchImpl: f })).toEqual({ ok: true, skipped: "siteverify_unavailable" });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(code));
  }
});

it("4xx with a token verdict still refuses (only outages fail open)", async () => {
  const f = jest.fn().mockResolvedValue(json(400, { success: false, "error-codes": ["invalid-input-response"] }));
  expect(await verifyTurnstile("tok", null, { env: ON, fetchImpl: f })).toMatchObject({ ok: false, reason: "invalid_token" });
});
