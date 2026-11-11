/**
 * @jest-environment node
 */

jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: jest.fn(() => ({
    rpc: jest.fn().mockResolvedValue({ data: null, error: { message: "missing cutover function" } }),
  })),
}));
jest.mock("@/lib/resend-for-brand", () => ({
  getResendForBrand: () => null,
}));
jest.mock("@/lib/posthog-server", () => ({ getPostHogClient: () => ({ capture: jest.fn() }) }));

import { postBrevoTransactional } from "@/lib/email-brevo-transport";
import { createMemoryCutoverDeps, cutoverBlocksNewLogin, runBrevoCutover } from "@/lib/email-cutover";
import { cutoverOperationKey } from "@/lib/email-operation-key";
import {
  BREVO_FREE_PLAN_DAILY_RECIPIENTS,
  brevoQuotaSeed,
  brevoRecipientCap,
  brevoWindowKey,
  countEnvelopeRecipients,
  idempotencyTag,
  isBrevoCutoverEnabled,
} from "@/lib/email-cutover-config";
import { deliverEmail } from "@/lib/email-deliver";
import { applyReserve } from "@/lib/email-quota-state";
import type { CutoverDeps } from "@/lib/email-cutover";
import type { ProviderHttpResult } from "@/lib/email-brevo-classify";

const brand = { id: "wardsignup", name: "Ward Signup" } as never;

function message(over: Record<string, unknown> = {}) {
  return {
    brand,
    from: "Ward Signup <noreply@wardsignup.com>",
    to: "person@example.com",
    subject: "Hello",
    html: "<p>Hi</p>",
    kind: "magic_link",
    idempotencyKey: "email-queue/1",
    ...over,
  } as never;
}

const baseEnv = {
  EMAIL_PROVIDER_CUTOVER: "brevo",
  WARDSIGNUP_BREVO_API_KEY: "xkeysib-test-key",
  BREVO_API_KEY: "mcp-token-not-for-http",
  BREVO_DAILY_RECIPIENT_CAP: "5",
  BREVO_QUOTA_USED_AT_OPEN: "0",
  RESEND_UTC_DAY_CAP: "2",
  RESEND_DAILY_SOFT_LIMIT: "2",
};

function harness(env: Record<string, string> = baseEnv, now = new Date("2026-11-08T16:05:00Z")) {
  let clock = now;
  const brevo = jest.fn(async (): Promise<ProviderHttpResult> => ({
    status: 201,
    body: JSON.stringify({ messageId: "<accepted@brevo>" }),
    messageId: "<accepted@brevo>",
  }));
  const resend = jest.fn(async (): Promise<ProviderHttpResult> => ({
    status: 200,
    body: "",
    messageId: "re_123",
  }));
  const deps = createMemoryCutoverDeps({
    env,
    now: () => clock,
    sendBrevo: brevo,
    sendResend: resend,
  });
  return {
    deps,
    brevo,
    resend,
    setClock(next: Date) {
      clock = next;
    },
  };
}

async function send(deps: CutoverDeps, over: Record<string, unknown> = {}) {
  return runBrevoCutover(message(over), { urgent: true }, deps);
}

beforeEach(() => {
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

describe("cutover config", () => {
  it("stays off unless the gate is exactly brevo", () => {
    expect(isBrevoCutoverEnabled({})).toBe(false);
    expect(isBrevoCutoverEnabled({ EMAIL_PROVIDER_CUTOVER: "resend" })).toBe(false);
    expect(isBrevoCutoverEnabled({ EMAIL_PROVIDER_CUTOVER: " brevo " })).toBe(true);
  });

  it("refuses until cap and seed are both explicit, and does not store 288", () => {
    expect(BREVO_FREE_PLAN_DAILY_RECIPIENTS).toBe(300);
    expect(brevoRecipientCap({})).toBeNull();
    expect(brevoRecipientCap({ BREVO_DAILY_RECIPIENT_CAP: "288" })).toBe(288);
    expect(brevoRecipientCap({ BREVO_DAILY_RECIPIENT_CAP: "10000" })).toBe(300);
    expect(brevoRecipientCap({ BREVO_DAILY_RECIPIENT_CAP: "unknown" })).toBeNull();
    expect(brevoRecipientCap({ BREVO_DAILY_RECIPIENT_CAP: "0" })).toBeNull();
    expect(brevoRecipientCap({ BREVO_DAILY_RECIPIENT_CAP: "1.5" })).toBeNull();
    expect(brevoWindowKey({})).toBe("unconfirmed-reset");
    expect(brevoQuotaSeed({})).toBeNull();
    expect(brevoQuotaSeed({ BREVO_QUOTA_USED_AT_OPEN: "0" })).toBe(0);
    expect(brevoQuotaSeed({ BREVO_QUOTA_USED_AT_OPEN: "12" })).toBe(12);
    expect(brevoQuotaSeed({ BREVO_QUOTA_USED_AT_OPEN: "unknown" })).toBeNull();
  });

  it("counts every envelope recipient and refuses an empty list", () => {
    expect(countEnvelopeRecipients("a@b.com")).toBe(1);
    expect(countEnvelopeRecipients("a@b.com, c@d.com")).toBe(2);
    expect(countEnvelopeRecipients("a@b.com", ["c@d.com"])).toBe(2);
    expect(countEnvelopeRecipients("not-an-email")).toBe(0);
  });
});

describe("From and credential boundary", () => {
  function okFetch() {
    return jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ messageId: "<id@brevo>" }),
      headers: { get: () => null },
    });
  }

  it.each([
    ["noreply@wardsignup.com", "Ward Signup"],
    ["jonathan@wardsignup.com", "Jonathan"],
  ])("posts as the verified sender %s with only the passed sending key", async (email, name) => {
    const fetchImpl = okFetch();
    await postBrevoTransactional(
      {
        apiKey: "xkeysib-test-key",
        senderEmail: email,
        senderName: name,
        to: ["person@example.com"],
        subject: "Hello",
        html: "<p>Hi</p>",
        idempotencyKey: "email-queue/1",
      },
      fetchImpl as never,
    );
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.headers["api-key"]).toBe("xkeysib-test-key");
    expect(init.headers["api-key"]).not.toBe("mcp-token-not-for-http");
    const body = JSON.parse(init.body);
    expect(body.sender).toEqual({ email, name });
    expect(body.replyTo).toBeUndefined();
    expect(body.tags).toContain(idempotencyTag("email-queue/1"));
  });

  it.each(["bondesign@gmail.com", "hello@wardsignup.com", "noreply@wardsignup.com.evil.com"])(
    "refuses sender %s before fetch",
    async (senderEmail) => {
      const fetchImpl = jest.fn();
      const result = await postBrevoTransactional(
        {
          apiKey: "xkeysib-test-key",
          senderEmail,
          senderName: "X",
          to: ["person@example.com"],
          subject: "Hello",
          html: "<p>Hi</p>",
          idempotencyKey: "k",
        },
        fetchImpl as never,
      );
      expect(result.localRefusal).toBe("from");
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it("keeps a noreply From as noreply on Brevo and on the Resend fallback", async () => {
    const { deps, brevo } = harness();
    const ok = await send(deps, { kind: "reminder", idempotencyKey: "noreply-brevo" });
    expect(ok).toMatchObject({ ok: true, provider: "brevo" });
    expect(brevo).toHaveBeenCalledWith(
      expect.objectContaining({ senderEmail: "noreply@wardsignup.com", senderName: "Ward Signup" }),
    );

    const fb = harness();
    fb.brevo.mockResolvedValueOnce({ status: 401, body: JSON.stringify({ code: "unauthorized" }), messageId: null });
    const r = await send(fb.deps, { kind: "reminder", idempotencyKey: "noreply-fallback" });
    expect(r).toMatchObject({ ok: true, provider: "resend" });
    expect(fb.resend).toHaveBeenCalledWith(expect.objectContaining({ from: "Ward Signup <noreply@wardsignup.com>" }));
  });

  it("keeps the welcome and feedback-ask From as jonathan@ on Brevo and on the Resend fallback", async () => {
    for (const kind of ["welcome", "feedback"]) {
      const { deps, brevo } = harness();
      await send(deps, { kind, from: "Jonathan <jonathan@wardsignup.com>", idempotencyKey: `j-${kind}` });
      expect(brevo).toHaveBeenCalledWith(
        expect.objectContaining({ senderEmail: "jonathan@wardsignup.com", senderName: "Jonathan" }),
      );
      const fb = harness();
      fb.brevo.mockResolvedValueOnce({ status: 401, body: JSON.stringify({ code: "unauthorized" }), messageId: null });
      await send(fb.deps, { kind, from: "Jonathan <jonathan@wardsignup.com>", idempotencyKey: `jf-${kind}` });
      expect(fb.resend).toHaveBeenCalledWith(expect.objectContaining({ from: "Jonathan <jonathan@wardsignup.com>" }));
    }
  });

  it.each([
    "PFS <bondesign@gmail.com>",
    "bondesign@gmail.com",
    "Hello <hello@wardsignup.com>",
    "noreply@wardsignup.com, bondesign@gmail.com",
    "",
  ])("refuses From %p on the cutover path before any provider", async (from) => {
    const { deps, brevo, resend } = harness();
    const result = await send(deps, { from, idempotencyKey: `bad-${from}` });
    expect(result).toMatchObject({ ok: false, terminal: true });
    expect(brevo).not.toHaveBeenCalled();
    expect(resend).not.toHaveBeenCalled();
  });

  it("sends Brevo-first with only WARDSIGNUP_BREVO_API_KEY and does not read BREVO_API_KEY", async () => {
    const { deps, brevo, resend } = harness();
    const result = await send(deps);
    expect(result).toMatchObject({ ok: true, provider: "brevo", messageId: "<accepted@brevo>" });
    expect(brevo).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "xkeysib-test-key", to: ["person@example.com"] }));
    expect(resend).not.toHaveBeenCalled();
    const logs = JSON.stringify((console.info as jest.Mock).mock.calls);
    expect(logs).not.toContain("xkeysib-test-key");
    expect(logs).not.toContain("person@example.com");
    expect(logs).toContain("provider=brevo");
  });

  it("does not fall back when the sending key is missing", async () => {
    const { deps, brevo, resend } = harness({ ...baseEnv, WARDSIGNUP_BREVO_API_KEY: "" });
    const result = await send(deps);
    expect(result).toMatchObject({ ok: false, terminal: true });
    expect(String((result as { error?: string }).error)).toContain("WARDSIGNUP_BREVO_API_KEY");
    expect(brevo).not.toHaveBeenCalled();
    expect(resend).not.toHaveBeenCalled();
  });
});

describe("routing", () => {
  it("sends magic links, reminders, and digests to Brevo first", async () => {
    const { deps, brevo, resend } = harness();
    for (const kind of ["magic_link", "reminder", "digest"]) {
      const result = await send(deps, { kind, idempotencyKey: `k-${kind}` });
      expect(result).toMatchObject({ ok: true, provider: "brevo" });
    }
    expect(brevo).toHaveBeenCalledTimes(3);
    expect(resend).not.toHaveBeenCalled();
  });
});

describe("quota", () => {
  it("counts a two-recipient batch as two and stops a batch the cap cannot hold", async () => {
    const held = harness({ ...baseEnv, BREVO_DAILY_RECIPIENT_CAP: "2", RESEND_UTC_DAY_CAP: "1" });
    const ok = await send(held.deps, { to: "a@example.com, b@example.com", idempotencyKey: "batch" });
    expect(ok).toMatchObject({ ok: true, provider: "brevo" });
    expect(held.brevo).toHaveBeenCalledWith(expect.objectContaining({ to: ["a@example.com", "b@example.com"] }));
    expect(held.deps.state.quotas.get("brevo:unconfirmed-reset")?.reserved).toBe(2);

    const blocked = harness({ ...baseEnv, BREVO_DAILY_RECIPIENT_CAP: "1", RESEND_UTC_DAY_CAP: "1" });
    const refused = await send(blocked.deps, { to: "a@example.com, b@example.com", idempotencyKey: "too-big" });
    expect(refused).toMatchObject({ ok: false, overBudget: true });
    expect(blocked.brevo).not.toHaveBeenCalled();
    expect(blocked.resend).not.toHaveBeenCalled();
  });

  it("serializes concurrent reservations and then the Resend cap", async () => {
    const { deps, brevo, resend } = harness({ ...baseEnv, BREVO_DAILY_RECIPIENT_CAP: "2", RESEND_UTC_DAY_CAP: "1" });
    const results = await Promise.all(
      ["a", "b", "c", "d", "e"].map((id) => send(deps, { idempotencyKey: id, to: `${id}@example.com` })),
    );
    expect(brevo).toHaveBeenCalledTimes(2);
    expect(resend).toHaveBeenCalledTimes(1);
    expect(results.filter((result) => result.ok).length).toBe(3);
    expect(results.filter((result) => !result.ok && "overBudget" in result && result.overBudget).length).toBe(2);
    expect(deps.state.quotas.get("brevo:unconfirmed-reset")?.reserved).toBe(2);
  });

  it("does not refill a Brevo window when the clock moves; a new window uses the same explicit seed", async () => {
    const { deps, brevo, resend, setClock } = harness({ ...baseEnv, BREVO_DAILY_RECIPIENT_CAP: "1" });
    expect(await send(deps, { idempotencyKey: "day-1" })).toMatchObject({ ok: true, provider: "brevo" });
    setClock(new Date("2026-11-10T18:00:00Z"));
    expect(await send(deps, { idempotencyKey: "day-2", to: "other@example.com" })).toMatchObject({
      ok: true,
      provider: "resend",
    });
    expect(brevo).toHaveBeenCalledTimes(1);
    expect(resend).toHaveBeenCalledTimes(1);
    expect(deps.state.quotas.get("brevo:unconfirmed-reset")?.reserved).toBe(1);

    deps.env.BREVO_QUOTA_WINDOW_ID = "confirmed-2026-11-10";
    expect(await send(deps, { idempotencyKey: "day-3", to: "third@example.com" })).toMatchObject({
      ok: true,
      provider: "brevo",
    });
    expect(brevo).toHaveBeenCalledTimes(2);
    expect(deps.state.quotas.get("brevo:confirmed-2026-11-10")?.reserved).toBe(1);
  });

  it("refuses an unknown cap without calling either provider", async () => {
    const { deps, brevo, resend } = harness({ ...baseEnv, BREVO_DAILY_RECIPIENT_CAP: "unknown" });
    const result = await send(deps);
    expect(result).toMatchObject({ ok: false, retryable: true });
    expect(String((result as { error?: string }).error)).toContain("unknown");
    expect(brevo).not.toHaveBeenCalled();
    expect(resend).not.toHaveBeenCalled();
  });

  it("keeps an exhausted latch across time on the same window", () => {
    let row = applyReserve(null, 1, 1, 0).row;
    row = { ...row!, exhausted: true };
    const later = applyReserve(row, 1, 300, 0);
    expect(later.outcome.result).toBe("exhausted");
    expect(later.row?.reserved).toBe(1);
  });
});

describe("provider outcomes", () => {
  it("retries a 429 on Brevo and does not call Resend", async () => {
    const { deps, brevo, resend } = harness();
    brevo
      .mockResolvedValueOnce({
        status: 429,
        body: JSON.stringify({ code: "too_many_requests", message: "API call rate limit exceeded" }),
        rateLimitResetSeconds: 30,
      })
      .mockResolvedValueOnce({ status: 201, body: "{}", messageId: "<second@brevo>" });
    const first = await send(deps);
    expect(first).toMatchObject({ ok: false, retryable: true });
    expect(resend).not.toHaveBeenCalled();
    expect(deps.state.quotas.get("brevo:unconfirmed-reset")?.reserved).toBe(0);
    const second = await send(deps);
    expect(second).toMatchObject({ ok: true, provider: "brevo", messageId: "<second@brevo>" });
    expect(brevo).toHaveBeenCalledTimes(2);
    expect(resend).not.toHaveBeenCalled();
  });

  it("does not walk under the seed when a release fails and the retry is rate limited again", async () => {
    const { deps, brevo, resend } = harness({
      ...baseEnv,
      BREVO_DAILY_RECIPIENT_CAP: "300",
      BREVO_QUOTA_USED_AT_OPEN: "12",
    });
    const real = deps.releaseHeld.bind(deps);
    let releases = 0;
    deps.releaseHeld = async (...args) => {
      releases += 1;
      if (releases === 1) return "unavailable";
      return real(...args);
    };
    brevo.mockResolvedValue({
      status: 429,
      body: JSON.stringify({ code: "too_many_requests", message: "API call rate limit exceeded" }),
    });
    const first = await send(deps, { idempotencyKey: "seed-release" });
    expect(first).toMatchObject({ ok: false, retryable: true });
    expect(resend).not.toHaveBeenCalled();
    expect(deps.state.quotas.get("brevo:unconfirmed-reset")?.reserved).toBe(13);
    const second = await send(deps, { idempotencyKey: "seed-release" });
    expect(second).toMatchObject({ ok: false, retryable: true });
    expect(brevo).toHaveBeenCalledTimes(2);
    expect(deps.state.quotas.get("brevo:unconfirmed-reset")?.reserved).toBe(12);
    const replay = await deps.releaseHeld("seed-release", "brevo", "unconfirmed-reset", 1);
    expect(replay).toBe("already_released");
    expect(deps.state.quotas.get("brevo:unconfirmed-reset")?.reserved).toBe(12);
  });

  it("blocks a new login when the uncertainty lookup fails", async () => {
    await expect(cutoverBlocksNewLogin("magic:wardsignup:a@example.com", baseEnv)).resolves.toBe(true);
  });

  it("does not fall back after a timeout, a 5xx, or a 201 without a message id", async () => {
    for (const [name, http] of [
      ["timeout", { status: null, body: "timed out after 15000ms" }],
      ["http 503", { status: 503, body: "unavailable" }],
      ["no message id", { status: 201, body: "{}", messageId: null }],
    ] as const) {
      const { deps, brevo, resend } = harness();
      brevo.mockResolvedValue(http);
      const result = await send(deps, { idempotencyKey: name });
      expect(result).toMatchObject({ ok: false, ambiguous: true });
      expect(resend).not.toHaveBeenCalled();
      const again = await send(deps, { idempotencyKey: name });
      expect(again).toMatchObject({ ok: false, ambiguous: true, duplicateSuppressed: true });
      expect(brevo).toHaveBeenCalledTimes(1);
      expect(resend).not.toHaveBeenCalled();
    }
  });

  it("falls back once on a definitive quota rejection and then keeps the latch", async () => {
    const { deps, brevo, resend } = harness({ ...baseEnv, BREVO_DAILY_RECIPIENT_CAP: "5", RESEND_UTC_DAY_CAP: "1" });
    brevo.mockResolvedValue({
      status: 400,
      body: JSON.stringify({ code: "not_enough_credits", message: "Not enough credits to send this email" }),
    });
    const first = await send(deps, { idempotencyKey: "q1" });
    expect(first).toMatchObject({ ok: true, provider: "resend", messageId: "re_123" });
    expect(brevo).toHaveBeenCalledTimes(1);
    expect(resend).toHaveBeenCalledTimes(1);
    expect(deps.state.quotas.get("brevo:unconfirmed-reset")?.exhausted).toBe(true);
    const second = await send(deps, { idempotencyKey: "q2", to: "two@example.com" });
    expect(second).toMatchObject({ ok: false, overBudget: true });
    expect(brevo).toHaveBeenCalledTimes(1);
    expect(resend).toHaveBeenCalledTimes(1);
  });

  it("falls back once on auth failure and never on a validation error", async () => {
    const auth = harness();
    auth.brevo.mockResolvedValue({ status: 401, body: JSON.stringify({ code: "unauthorized", message: "Key not found" }) });
    expect(await send(auth.deps, { idempotencyKey: "auth" })).toMatchObject({ ok: true, provider: "resend" });
    expect(auth.resend).toHaveBeenCalledTimes(1);

    const invalid = harness();
    invalid.brevo.mockResolvedValue({
      status: 400,
      body: JSON.stringify({ code: "invalid_parameter", message: "email is not valid" }),
    });
    expect(await send(invalid.deps, { idempotencyKey: "bad" })).toMatchObject({ ok: false, terminal: true });
    expect(invalid.resend).not.toHaveBeenCalled();
  });

  it("does not retry an ambiguous Resend fallback", async () => {
    const { deps, brevo, resend } = harness();
    brevo.mockResolvedValue({ status: 401, body: JSON.stringify({ code: "unauthorized", message: "no" }) });
    resend.mockResolvedValue({ status: null, body: "socket hang up" });
    const first = await send(deps);
    expect(first).toMatchObject({ ok: false, ambiguous: true });
    const second = await send(deps);
    expect(second).toMatchObject({ ok: false, ambiguous: true, duplicateSuppressed: true });
    expect(brevo).toHaveBeenCalledTimes(1);
    expect(resend).toHaveBeenCalledTimes(1);
  });

  it("does not send again for an idempotency key Brevo already accepted", async () => {
    const { deps, brevo, resend } = harness();
    expect(await send(deps)).toMatchObject({ ok: true, provider: "brevo" });
    const again = await send(deps);
    expect(again).toMatchObject({ ok: true, duplicateSuppressed: true, provider: "brevo" });
    expect(brevo).toHaveBeenCalledTimes(1);
    expect(resend).not.toHaveBeenCalled();
  });

  it("closes an in-flight HTTP attempt as ambiguous instead of sending it", async () => {
    const { deps, brevo } = harness();
    await deps.claim({
      key: "email-queue/1",
      brandId: "wardsignup",
      kind: "magic_link",
      toAddress: "person@example.com",
      recipientCount: 1,
    });
    await deps.markHttpStarted("email-queue/1");
    const result = await send(deps);
    expect(result).toMatchObject({ ok: false, ambiguous: true });
    expect(brevo).not.toHaveBeenCalled();
  });

  it("retries a pre-HTTP row after it is stale and does not reserve twice", async () => {
    const { deps, brevo, resend } = harness();
    await deps.claim({
      key: "email-queue/1",
      brandId: "wardsignup",
      kind: "magic_link",
      toAddress: "person@example.com",
      recipientCount: 1,
    });
    const row = deps.state.attempts.get("email-queue/1");
    if (!row) throw new Error("missing attempt");
    deps.state.attempts.set("email-queue/1", { ...row, httpStarted: false, quotaHeld: true, updatedAt: Date.now() - 120_000 });
    deps.state.quotas.set("brevo:unconfirmed-reset", { reserved: 1, exhausted: false });
    const result = await send(deps);
    expect(result).toMatchObject({ ok: true, provider: "brevo" });
    expect(brevo).toHaveBeenCalledTimes(1);
    expect(resend).not.toHaveBeenCalled();
    expect(deps.state.quotas.get("brevo:unconfirmed-reset")?.reserved).toBe(1);
    expect(deps.state.attempts.get("email-queue/1")?.phase).toBe("primary_accepted");
  });

  it("seeds the first reservation with dashboard usage and refuses a missing seed", async () => {
    const seeded = harness({ ...baseEnv, BREVO_DAILY_RECIPIENT_CAP: "300", BREVO_QUOTA_USED_AT_OPEN: "12" });
    expect(await send(seeded.deps, { idempotencyKey: "seeded" })).toMatchObject({ ok: true, provider: "brevo" });
    expect(seeded.deps.state.quotas.get("brevo:unconfirmed-reset")?.reserved).toBe(13);

    const { BREVO_QUOTA_USED_AT_OPEN: _seed, ...noSeed } = baseEnv;
    const missing = harness(noSeed);
    const refused = await send(missing.deps, { idempotencyKey: "no-seed" });
    expect(refused).toMatchObject({ ok: false, retryable: true });
    expect(missing.brevo).not.toHaveBeenCalled();
    expect(missing.resend).not.toHaveBeenCalled();
    expect(missing.deps.state.quotas.has("brevo:unconfirmed-reset")).toBe(false);
  });

  it("does not give the Resend fallback a fresh budget when today's counter is already full", async () => {
    const { deps, brevo, resend } = harness({
      ...baseEnv,
      BREVO_DAILY_RECIPIENT_CAP: "1",
      RESEND_UTC_DAY_CAP: "2",
      RESEND_DAILY_SOFT_LIMIT: "2",
      RESEND_ALREADY_USED: "2",
    });
    expect(await send(deps, { idempotencyKey: "one" })).toMatchObject({ ok: true, provider: "brevo" });
    const second = await send(deps, { idempotencyKey: "two", to: "two@example.com" });
    expect(second).toMatchObject({ ok: false, overBudget: true });
    expect(brevo).toHaveBeenCalledTimes(1);
    expect(resend).not.toHaveBeenCalled();
  });

  it("falls back on a definitive sender failure and not on a recipient validation error", async () => {
    const sender = harness();
    sender.brevo.mockResolvedValue({
      status: 400,
      body: JSON.stringify({ code: "invalid_parameter", message: "Sender is not valid" }),
    });
    expect(await send(sender.deps, { idempotencyKey: "sender" })).toMatchObject({ ok: true, provider: "resend" });
    expect(sender.resend).toHaveBeenCalledTimes(1);

    const recipient = harness();
    recipient.brevo.mockResolvedValue({
      status: 400,
      body: JSON.stringify({ code: "invalid_parameter", message: "email is not valid" }),
    });
    expect(await send(recipient.deps, { idempotencyKey: "recipient" })).toMatchObject({ ok: false, terminal: true });
    expect(recipient.resend).not.toHaveBeenCalled();
  });

  it("does not fall back when the rejection receipt cannot be stored", async () => {
    const { deps, brevo, resend } = harness();
    brevo.mockResolvedValue({ status: 401, body: JSON.stringify({ code: "unauthorized", message: "Key not found" }) });
    deps.finish = async () => false;
    const result = await send(deps, { idempotencyKey: "finish-fail" });
    expect(result).toMatchObject({ ok: false, retryable: true });
    expect(result).not.toMatchObject({ ambiguous: true });
    expect(resend).not.toHaveBeenCalled();
  });

  it("treats an unexpected reserve payload as unknown and does not send", async () => {
    const { deps, brevo, resend } = harness();
    deps.reserve = async () => ({ result: "surprise" }) as never;
    const result = await send(deps, { idempotencyKey: "bad-payload" });
    expect(result).toMatchObject({ ok: false, retryable: true });
    expect(brevo).not.toHaveBeenCalled();
    expect(resend).not.toHaveBeenCalled();
  });

  it("refuses a missing idempotency key instead of minting a new one", async () => {
    const { deps, brevo, resend } = harness();
    const result = await send(deps, { idempotencyKey: "  " });
    expect(result).toMatchObject({ ok: false, terminal: true });
    expect(brevo).not.toHaveBeenCalled();
    expect(resend).not.toHaveBeenCalled();
    expect(deps.state.attempts.size).toBe(0);
  });

  it("blocks a hard bounce for a magic link and still allows an unsubscribe", async () => {
    const hard = harness();
    hard.deps.recipientBlock = async () => "hard";
    expect(await send(hard.deps, { idempotencyKey: "hard", kind: "magic_link" })).toMatchObject({ ok: false, terminal: true });
    expect(hard.brevo).not.toHaveBeenCalled();

    const unsub = harness();
    unsub.deps.recipientBlock = async (_email, kind) => (kind === "reminder" ? "unsubscribe" : "allow");
    expect(await send(unsub.deps, { idempotencyKey: "login", kind: "magic_link" })).toMatchObject({ ok: true, provider: "brevo" });
    expect(await send(unsub.deps, { idempotencyKey: "remind", kind: "reminder", to: "other@example.com" })).toMatchObject({
      ok: false,
      terminal: true,
    });
  });

  it("checks every envelope recipient, not only the first", async () => {
    const hard = harness();
    hard.deps.recipientBlock = async (email) => (email === "bounced@example.com" ? "hard" : "allow");
    expect(
      await send(hard.deps, { idempotencyKey: "two-hard", to: "ok@example.com, bounced@example.com" }),
    ).toMatchObject({ ok: false, terminal: true });
    expect(hard.brevo).not.toHaveBeenCalled();
    expect(hard.resend).not.toHaveBeenCalled();

    const unknown = harness();
    unknown.deps.recipientBlock = async (email) => (email === "second@example.com" ? "unknown" : "allow");
    expect(
      await send(unknown.deps, { idempotencyKey: "two-unknown", kind: "magic_link", to: "a@example.com, second@example.com" }),
    ).toMatchObject({ ok: false, retryable: true });
    expect(unknown.brevo).not.toHaveBeenCalled();
  });

  it("does not send a magic link or a welcome when the suppression list cannot be read", async () => {
    for (const kind of ["magic_link", "welcome", "signup_confirmation", "org_invite_link"] as const) {
      const blocked = harness();
      blocked.deps.recipientBlock = async () => "unknown";
      const result = await send(blocked.deps, { idempotencyKey: `unknown-${kind}`, kind });
      expect(result).toMatchObject({ ok: false, retryable: true });
      expect(blocked.brevo).not.toHaveBeenCalled();
      expect(blocked.resend).not.toHaveBeenCalled();
      expect(blocked.deps.state.attempts.size).toBe(0);
    }
  });
});

describe("operation keys", () => {
  const on = { EMAIL_PROVIDER_CUTOVER: "brevo" };

  it("reuses a signup or invite key and does not collapse a new login token", () => {
    expect(cutoverOperationKey("signup_confirmation", ["signup-1"], on)).toBe(
      cutoverOperationKey("signup_confirmation", ["signup-1"], on),
    );
    expect(cutoverOperationKey("signup_confirmation", ["signup-1"], on)).not.toBe(
      cutoverOperationKey("signup_confirmation", ["signup-2"], on),
    );
    expect(cutoverOperationKey("org_invite", ["invite-a", "a@example.com"], on)).toBe(
      cutoverOperationKey("org_invite", ["invite-a", "a@example.com"], on),
    );
    const firstLogin = cutoverOperationKey("magic_link", ["wardsignup", "a@example.com", "token-1"], on);
    const retry = cutoverOperationKey("magic_link", ["wardsignup", "a@example.com", "token-1"], on);
    const newLogin = cutoverOperationKey("magic_link", ["wardsignup", "a@example.com", "token-2"], on);
    expect(retry).toBe(firstLogin);
    expect(newLogin).not.toBe(firstLogin);
    expect(cutoverOperationKey("magic_link", ["wardsignup", "a@example.com", "token-2"], {})).toBeUndefined();
  });
});

describe("production gate", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it("keeps deliverEmail on the existing path while the gate is off", async () => {
    delete process.env.EMAIL_PROVIDER_CUTOVER;
    delete process.env.EMAIL_FALLBACK_PROVIDER;
    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_SENDER_EMAIL;
    delete process.env.VERCEL_ENV;
    const fetchImpl = jest.fn();
    (global as { fetch?: unknown }).fetch = fetchImpl;
    const result = await deliverEmail(message(), { urgent: true });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(String((result as { error?: string }).error)).not.toContain("ambiguous");
  });

  it("fail-closes when the gate is on and the quota functions are missing", async () => {
    process.env.EMAIL_PROVIDER_CUTOVER = "brevo";
    process.env.WARDSIGNUP_BREVO_API_KEY = "xkeysib-test-key";
    delete process.env.VERCEL_ENV;
    const fetchImpl = jest.fn();
    (global as { fetch?: unknown }).fetch = fetchImpl;
    const result = await deliverEmail(message({ idempotencyKey: "missing-rpc" }), { urgent: true });
    expect(result).toMatchObject({ ok: false, retryable: true });
    expect(result).not.toMatchObject({ ambiguous: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("disables outbound on preview before a provider or quota call", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.EMAIL_PROVIDER_CUTOVER = "brevo";
    process.env.WARDSIGNUP_BREVO_API_KEY = "xkeysib-test-key";
    const fetchImpl = jest.fn();
    (global as { fetch?: unknown }).fetch = fetchImpl;
    const result = await deliverEmail(message(), { urgent: true });
    expect(result).toMatchObject({ ok: false, outboundDisabled: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
