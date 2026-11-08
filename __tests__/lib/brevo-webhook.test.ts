/**
 * @jest-environment node
 */

import { authorizeBrevoWebhook, handleBrevoWebhook, parseBrevoWebhookEvents } from "@/lib/brevo-webhook";
import { nextDeliveryStatus } from "@/lib/email-quota-state";
import type { BrevoWebhookDeps, BrevoWebhookEffect } from "@/lib/brevo-webhook";

const NOW = Date.parse("2026-11-08T16:05:00Z");

function event(over: Record<string, unknown> = {}) {
  return {
    event: "hardBounce",
    email: "Person@Example.com",
    id: 42,
    "message-id": "<abc@brevo>",
    ts_epoch: NOW - 1000,
    tag: '["wardsignup","kemailqueue1"]',
    reason: "unknown user",
    ...over,
  };
}

function deps(overrides: Partial<BrevoWebhookDeps> = {}): BrevoWebhookDeps & {
  suppressed: Array<{ email: string; reason: string }>;
  statuses: BrevoWebhookEffect[];
  seen: Set<string>;
} {
  const seen = new Set<string>();
  const suppressed: Array<{ email: string; reason: string }> = [];
  const statuses: BrevoWebhookEffect[] = [];
  return {
    env: { BREVO_WEBHOOK_TOKEN: "whsec-test", WARDSIGNUP_BREVO_API_KEY: "xkeysib-test-key" },
    now: () => new Date(NOW),
    recordEvent: async (id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    },
    forgetEvent: async (id) => {
      seen.delete(id);
    },
    suppress: async (email, reason) => {
      suppressed.push({ email, reason });
      return true;
    },
    applyStatus: async (effect) => {
      statuses.push(effect);
    },
    suppressed,
    statuses,
    seen,
    ...overrides,
  };
}

function request(body: unknown, headers: Record<string, string> = { authorization: "Bearer whsec-test" }) {
  return new Request("https://wardsignup.com/api/webhooks/brevo", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("brevo webhook auth", () => {
  it("refuses when the webhook token is unset, even if the sending key is present", () => {
    const result = authorizeBrevoWebhook(
      new Headers({ authorization: "Bearer xkeysib-test-key" }),
      { WARDSIGNUP_BREVO_API_KEY: "xkeysib-test-key" },
    );
    expect(result).toMatchObject({ ok: false, status: 503 });
  });

  it("rejects the sending key and accepts the bearer token or the custom header", () => {
    const env = { BREVO_WEBHOOK_TOKEN: "whsec-test", WARDSIGNUP_BREVO_API_KEY: "xkeysib-test-key" };
    expect(authorizeBrevoWebhook(new Headers({ authorization: "Bearer xkeysib-test-key" }), env)).toMatchObject({
      ok: false,
      status: 401,
    });
    expect(authorizeBrevoWebhook(new Headers({ authorization: "Bearer whsec-test" }), env).ok).toBe(true);
    expect(authorizeBrevoWebhook(new Headers({ "x-wardsignup-webhook-token": "whsec-test" }), env).ok).toBe(true);
  });
});

describe("brevo webhook effects", () => {
  it("suppresses hard bounces and complaints, and not soft bounces", () => {
    const hard = parseBrevoWebhookEvents(event(), NOW);
    const soft = parseBrevoWebhookEvents(event({ event: "softBounce", id: 43 }), NOW);
    const spam = parseBrevoWebhookEvents(event({ event: "spam", id: 44 }), NOW);
    expect(hard.ok && hard.events[0]).toMatchObject({
      email: "person@example.com",
      suppress: "bounce",
      deliveryStatus: "bounced",
      messageId: "<abc@brevo>",
      tag: "kemailqueue1",
    });
    expect(soft.ok && soft.events[0]).toMatchObject({ suppress: null, deliveryStatus: "deferred" });
    expect(spam.ok && spam.events[0]).toMatchObject({ suppress: "complaint", deliveryStatus: "complained" });
  });

  it("rejects a stale or future timestamp and a payload with no timestamp", () => {
    expect(parseBrevoWebhookEvents(event({ ts_epoch: NOW - 25 * 60 * 60 * 1000 }), NOW).ok).toBe(false);
    expect(parseBrevoWebhookEvents(event({ ts_epoch: NOW + 10 * 60 * 1000 }), NOW).ok).toBe(false);
    expect(parseBrevoWebhookEvents(event({ ts_epoch: undefined, ts: undefined }), NOW).ok).toBe(false);
  });

  it("moves delivery status forward and does not move it backward", () => {
    expect(nextDeliveryStatus("accepted", "delivered")).toBe("delivered");
    expect(nextDeliveryStatus("delivered", "bounced")).toBe("bounced");
    expect(nextDeliveryStatus("bounced", "delivered")).toBe("bounced");
    expect(nextDeliveryStatus("complained", "bounced")).toBe("complained");
    expect(nextDeliveryStatus("delivered", "deferred")).toBe("delivered");
  });

  it("applies a bounce once and ignores the replay", async () => {
    const store = deps();
    const first = await handleBrevoWebhook(request(event()), store);
    const second = await handleBrevoWebhook(request(event()), store);
    expect(await first.json()).toMatchObject({ ok: true, applied: 1, duplicates: 0 });
    expect(await second.json()).toMatchObject({ ok: true, applied: 0, duplicates: 1 });
    expect(store.suppressed).toEqual([{ email: "person@example.com", reason: "bounce" }]);
    expect(store.statuses).toHaveLength(1);
  });

  it("forgets the event id when suppression fails so Brevo can retry", async () => {
    const store = deps({
      suppress: async () => false,
    });
    const response = await handleBrevoWebhook(request(event()), store);
    expect(response.status).toBe(500);
    expect(store.seen.size).toBe(0);
  });

  it("does not write on a preview deployment", async () => {
    const store = deps({ env: { VERCEL_ENV: "preview", BREVO_WEBHOOK_TOKEN: "whsec-test" } });
    const response = await handleBrevoWebhook(request(event()), store);
    expect(await response.json()).toMatchObject({ ok: true, disabled: true, reason: "preview" });
    expect(store.suppressed).toHaveLength(0);
    expect(store.seen.size).toBe(0);
  });

  it("rejects a missing or wrong token before recording the event", async () => {
    const store = deps();
    const missing = await handleBrevoWebhook(request(event(), {}), store);
    const wrong = await handleBrevoWebhook(request(event(), { authorization: "Bearer nope" }), store);
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(store.seen.size).toBe(0);
  });
});
