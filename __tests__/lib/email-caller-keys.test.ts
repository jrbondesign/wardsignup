/**
 * @jest-environment node
 *
 * Gate-on callers must pass a stable business key. A blank key is a terminal
 * refusal, so these tests call the real sender functions.
 */

const sendGuardedEmail = jest.fn(async (_params?: unknown): Promise<Record<string, unknown>> => ({ ok: true }));
const mockUpdates: Array<{ table: string; values: Record<string, unknown> }> = [];
jest.mock("@/lib/email-send", () => ({
  sendGuardedEmail: (params: unknown) => sendGuardedEmail(params),
}));
jest.mock("@/lib/resend-for-brand", () => ({
  getResendForBrand: () => ({ emails: { send: jest.fn() } }),
}));
jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = () =>
        table === "organizations"
          ? { maybeSingle: async () => ({ data: { owner_id: "u1" } }) }
          : chain;
      chain.order = self;
      chain.is = self;
      chain.gt = self;
      chain.update = (values: Record<string, unknown>) => {
        mockUpdates.push({ table, values });
        return chain;
      };
      chain.delete = self;
      chain.single = async () => ({
        data: {
          id: "c1",
          brand_id: "wardsignup",
          name: "Dinner",
          event_type: "spots",
          user_email: "organizer@example.com",
          organizer_instant_notify_enabled: true,
          organizer_last_instant_notify_at: "2026-11-08T12:00:00.000Z",
        },
        error: null,
      });
      chain.then = (resolve: (value: unknown) => unknown) =>
        resolve({
          data:
            table === "signups"
              ? [{ member_name: "Ada", signed_up_at: "2026-11-08T13:00:00.000Z", sessions: null }]
              : [],
          error: null,
          count: table === "campaigns" ? 1 : null,
        });
      return chain;
    },
    rpc: async () => ({ data: true }),
  }),
}));

import { sendFeedbackAskEmail, sendFeedbackResponseNotification } from "@/lib/feedback-email";
import { notifyFounderIfFirstEvent } from "@/lib/founder-notify";
import { sendOrganizerFasterAlertEmail, sendOrganizerMetricsEmail } from "@/lib/organizer-email";
import { sendParticipantSignupConfirmation } from "@/lib/participant-email";
import { getBrandDefinition, toPublicBrand } from "@/lib/brand/brands";
import { createServiceRoleClient } from "@/lib/supabase-admin";

const brand = toPublicBrand(getBrandDefinition("wardsignup"));

function keys(): string[] {
  return sendGuardedEmail.mock.calls.map((call) => {
    const params = call[0] as { idempotencyKey?: string } | undefined;
    return params?.idempotencyKey ?? "";
  });
}

beforeEach(() => {
  sendGuardedEmail.mockClear();
  mockUpdates.length = 0;
  process.env.EMAIL_PROVIDER_CUTOVER = "brevo";
});

afterEach(() => {
  delete process.env.EMAIL_PROVIDER_CUTOVER;
});

it("gives signup confirmation a stable key and keeps a retryable result", async () => {
  sendGuardedEmail.mockResolvedValueOnce({ ok: false, error: "Brevo rate limited", retryable: true, queued: true });
  const result = await sendParticipantSignupConfirmation({
    to: "person@example.com",
    memberName: "Ada",
    operationId: "signup-1",
    campaign: { id: "c1", name: "Dinner", brand_id: "wardsignup", event_timezone: "America/Phoenix" } as never,
    session: { day_of_week: 1, time: "18:00" } as never,
  });
  expect(result).toMatchObject({ ok: false, retryable: true, queued: true });
  const first = keys()[0];
  sendGuardedEmail.mockResolvedValueOnce({ ok: true });
  await sendParticipantSignupConfirmation({
    to: "person@example.com",
    memberName: "Ada",
    operationId: "signup-1",
    campaign: { id: "c1", name: "Dinner", brand_id: "wardsignup", event_timezone: "America/Phoenix" } as never,
    session: { day_of_week: 1, time: "18:00" } as never,
  });
  expect(keys()[1]).toBe(first);
  expect(first.startsWith("signup_confirmation/")).toBe(true);
});

it("gives a digest and an on-demand report different stable keys", async () => {
  const admin = createServiceRoleClient();
  await sendOrganizerMetricsEmail(admin, "c1", "digest");
  await sendOrganizerMetricsEmail(admin, "c1", "digest");
  await sendOrganizerMetricsEmail(admin, "c1", "manual");
  const [first, second, report] = keys();
  expect(first).toBe(second);
  expect(first.startsWith("organizer_digest/")).toBe(true);
  expect(report.startsWith("organizer_report/")).toBe(true);
  expect(report).not.toBe(first);
});

it("restores the faster watermark when the send is retryable", async () => {
  sendGuardedEmail.mockResolvedValueOnce({ ok: false, error: "down", retryable: true });
  const admin = createServiceRoleClient();
  const result = await sendOrganizerFasterAlertEmail(admin, "c1");
  expect(result).toMatchObject({ ok: false, retryable: true });
  expect(keys()[0].startsWith("organizer_faster/")).toBe(true);
  expect(mockUpdates.some((u) => u.values.organizer_last_instant_notify_at === "2026-11-08T12:00:00.000Z")).toBe(true);
});

it("keys feedback ask, feedback response, and the new-creator notice", async () => {
  await sendFeedbackAskEmail({
    brand,
    to: "creator@example.com",
    firstName: "Ada",
    formUrl: "https://wardsignup.com/feedback/t",
    requestId: "req-1",
  });
  await sendFeedbackAskEmail({
    brand,
    to: "creator@example.com",
    firstName: "Ada",
    formUrl: "https://wardsignup.com/feedback/t",
    requestId: "req-1",
  });
  await sendFeedbackResponseNotification({
    brand,
    creatorEmail: "creator@example.com",
    pmf: "very",
    retention: null,
    value: null,
    blocker: null,
    respondedAt: "2026-11-08T16:00:00.000Z",
  });
  await notifyFounderIfFirstEvent({
    user: { id: "u1", email: "creator@example.com", user_metadata: { full_name: "Ada" } } as never,
    orgId: "o1",
    orgName: "Mesa",
    eventId: "e1",
    eventName: "Dinner",
    brand,
    location: null,
  });
  const [ask, askAgain, response, creator] = keys();
  expect(ask).toBe(askAgain);
  expect(ask.startsWith("feedback_ask/")).toBe(true);
  expect(response.startsWith("feedback_response/")).toBe(true);
  expect(creator.startsWith("new_creator/")).toBe(true);
});
