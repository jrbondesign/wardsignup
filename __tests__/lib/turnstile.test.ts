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
