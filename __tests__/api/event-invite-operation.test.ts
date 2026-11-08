/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { POST } from "@/app/api/invites/route";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAdminCampaign } from "@/lib/campaign-access";
import { sendGuardedEmail } from "@/lib/email-send";
import { createServiceRoleClient } from "@/lib/supabase-admin";

jest.mock("@/lib/auth", () => ({ getAuthFromRequest: jest.fn() }));
jest.mock("@/lib/campaign-access", () => ({ userCanAdminCampaign: jest.fn(async () => true) }));
jest.mock("@/lib/rate-limit", () => ({ consumeActionRate: jest.fn(async () => ({ allowed: true })) }));
jest.mock("@/lib/email-deliver", () => ({ hasEmailProviderConfigured: () => true }));
jest.mock("@/lib/email-send", () => ({
  consumeEmailKeyRate: jest.fn(async () => true),
  sendGuardedEmail: jest.fn(),
}));
jest.mock("@/lib/posthog-server", () => ({ getPostHogClient: () => ({ capture: jest.fn() }) }));
jest.mock("@/lib/supabase-admin", () => ({ createServiceRoleClient: jest.fn() }));

const EVENT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const rpc = jest.fn();

function req() {
  return new NextRequest("https://wardsignup.com/api/invites", {
    method: "POST",
    headers: { "content-type": "application/json", host: "wardsignup.com" },
    body: JSON.stringify({ event_id: EVENT, invitee_email: "Teacher@Example.com" }),
  });
}

beforeEach(() => {
  process.env.FEATURE_APP_EMAIL_INVITES = "true";
  process.env.EMAIL_PROVIDER_CUTOVER = "brevo";
  rpc.mockReset();
  (createServiceRoleClient as jest.Mock).mockReturnValue({ rpc });
  (sendGuardedEmail as jest.Mock).mockReset();
  (sendGuardedEmail as jest.Mock).mockResolvedValue({ ok: true });
  (userCanAdminCampaign as jest.Mock).mockResolvedValue(true);
  (getAuthFromRequest as jest.Mock).mockResolvedValue({
    ok: true,
    user: { id: USER, email: "owner@example.com" },
    supabase: {
      from() {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = self;
        chain.single = async () => ({
          data: {
            id: EVENT,
            name: "Dinner",
            brand_id: "wardsignup",
            organization_id: "33333333-3333-4333-8333-333333333333",
          },
          error: null,
        });
        return chain;
      },
    },
  });
});

afterEach(() => {
  delete process.env.FEATURE_APP_EMAIL_INVITES;
  delete process.env.EMAIL_PROVIDER_CUTOVER;
});

function keys(): string[] {
  return (sendGuardedEmail as jest.Mock).mock.calls.map((call) => call[0].idempotencyKey as string);
}

it("mails a later invite under a new row and replays the same row once", async () => {
  rpc.mockResolvedValueOnce({ data: { result: "created", id: "invite-1" }, error: null });
  rpc.mockResolvedValueOnce({ data: true, error: null });
  const first = await POST(req());
  expect(first.status).toBe(200);
  expect(keys()[0]).toMatch(/^event_invite\//);

  rpc.mockResolvedValueOnce({ data: { result: "retry", id: "invite-1" }, error: null });
  rpc.mockResolvedValueOnce({ data: true, error: null });
  const replay = await POST(req());
  expect(replay.status).toBe(200);
  expect(keys()[1]).toBe(keys()[0]);

  rpc.mockResolvedValueOnce({ data: { result: "created", id: "invite-2" }, error: null });
  rpc.mockResolvedValueOnce({ data: true, error: null });
  const later = await POST(req());
  expect(later.status).toBe(200);
  expect(keys()[2]).toMatch(/^event_invite\//);
  expect(keys()[2]).not.toBe(keys()[0]);
  expect(rpc).toHaveBeenCalledWith(
    "finish_event_invite",
    expect.objectContaining({ p_id: "invite-2", p_outcome: "settled" }),
  );
});

it("does not send when the same invite is already in flight or already settled", async () => {
  rpc.mockResolvedValueOnce({ data: { result: "busy", id: "invite-1" }, error: null });
  const busy = await POST(req());
  expect(busy.status).toBe(409);
  rpc.mockResolvedValueOnce({ data: { result: "recent", id: "invite-1" }, error: null });
  const recent = await POST(req());
  expect(recent.status).toBe(409);
  expect(sendGuardedEmail).not.toHaveBeenCalled();
});

it("keeps an ambiguous invite on the same row and a retryable one reusable", async () => {
  (sendGuardedEmail as jest.Mock).mockResolvedValueOnce({ ok: false, error: "timed out", ambiguous: true });
  rpc.mockResolvedValueOnce({ data: { result: "created", id: "invite-1" }, error: null });
  rpc.mockResolvedValueOnce({ data: true, error: null });
  const ambiguous = await POST(req());
  expect(ambiguous.status).toBe(200);
  expect(await ambiguous.json()).toMatchObject({ success: true, delivery: "unconfirmed" });
  expect(rpc).toHaveBeenCalledWith(
    "finish_event_invite",
    expect.objectContaining({ p_id: "invite-1", p_outcome: "settled" }),
  );

  (sendGuardedEmail as jest.Mock).mockResolvedValueOnce({ ok: false, error: "down", retryable: true });
  rpc.mockResolvedValueOnce({ data: { result: "retry", id: "invite-1" }, error: null });
  rpc.mockResolvedValueOnce({ data: true, error: null });
  const retryable = await POST(req());
  expect(retryable.status).toBe(503);
  expect(keys()[1]).toBe(keys()[0]);
  expect(rpc).toHaveBeenCalledWith(
    "finish_event_invite",
    expect.objectContaining({ p_id: "invite-1", p_outcome: "retryable" }),
  );
});

it("does not send when the claim function is missing", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "function claim_event_invite does not exist" } });
  const res = await POST(req());
  expect(res.status).toBe(503);
  expect(sendGuardedEmail).not.toHaveBeenCalled();
});
