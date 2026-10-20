/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { POST } from "@/app/api/organizations/[id]/members/route";
import { getAuthFromRequest } from "@/lib/auth";
import { sendGuardedEmail } from "@/lib/email-send";
import { getPostHogClient } from "@/lib/posthog-server";

jest.mock("@/lib/auth", () => ({ getAuthFromRequest: jest.fn() }));
jest.mock("@/lib/campaign-access", () => ({ userIsAcceptedOrgMember: jest.fn() }));
jest.mock("@/lib/brand", () => ({
  getBrandFromHost: jest.fn(() => ({ id: "wardsignup", name: "WardSignup" })),
  inviteEmailFrom: jest.fn(() => "WardSignup <hello@example.com>"),
  publicSiteOriginFromRequest: jest.fn(() => "https://wardsignup.com"),
}));
jest.mock("@/lib/resend-for-brand", () => ({ hasResendConfiguredForBrand: jest.fn(() => true) }));
jest.mock("@/lib/email-send", () => ({ sendGuardedEmail: jest.fn() }));
jest.mock("@/lib/site-footer", () => ({ buildBrandSignatureFooterHtml: jest.fn(() => "") }));
jest.mock("@/lib/posthog-server", () => ({ getPostHogClient: jest.fn() }));

const ORG_ID = "11111111-2222-4333-8444-555555555555";
const OWNER_ID = "c0000000-0000-4000-8000-000000000002";

/** Chainable fake Supabase client covering the calls POST makes. */
function fakeSupabase() {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    const self = () => b;
    b.select = jest.fn(self);
    b.eq = jest.fn(self);
    b.upsert = jest.fn(self);
    b.update = jest.fn(self);
    b.maybeSingle = jest.fn(() =>
      Promise.resolve(
        table === "organizations"
          ? { data: { id: ORG_ID, name: "Test Ward", brand_id: "wardsignup", owner_id: OWNER_ID }, error: null }
          : { data: null, error: null },
      ),
    );
    b.single = jest.fn(() =>
      Promise.resolve({ data: { id: "m1", invited_email: "bishop@example.com", role: "admin", status: "pending" }, error: null }),
    );
    b.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null });
    return b;
  };
  return { from: jest.fn(builder) };
}

function req(body: Record<string, unknown>) {
  return new NextRequest(`https://wardsignup.com/api/organizations/${ORG_ID}/members`, {
    method: "POST",
    headers: { "content-type": "application/json", host: "wardsignup.com" },
    body: JSON.stringify(body),
  });
}

const capture = jest.fn();

function authAs(email: string) {
  (getAuthFromRequest as jest.Mock).mockResolvedValue({
    ok: true,
    supabase: fakeSupabase(),
    user: { id: OWNER_ID, email },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (getPostHogClient as jest.Mock).mockReturnValue({ capture });
  (sendGuardedEmail as jest.Mock).mockResolvedValue({ ok: true });
});

const params = { params: Promise.resolve({ id: ORG_ID }) };
const sentEvents = () => capture.mock.calls.map((c) => c[0]).filter((e) => e.event === "coadmin_invite_sent");

describe("coadmin_invite_sent", () => {
  it("fires once with org_id and is_test_org false for a real ward owner", async () => {
    authAs("clerk@example.com");
    const res = await POST(req({ email: "bishop@example.com" }), params);
    expect(res.status).toBe(201);
    expect(sentEvents()).toEqual([
      {
        distinctId: OWNER_ID,
        event: "coadmin_invite_sent",
        properties: { org_id: ORG_ID, is_test_org: false, brand_id: "wardsignup" },
      },
    ]);
    // The existing event is unchanged.
    expect(capture.mock.calls.some((c) => c[0].event === "org_member_invited")).toBe(true);
  });

  it("marks is_test_org true when the owner is a founder test account", async () => {
    authAs("Jonathan@WardSignup.com");
    await POST(req({ email: "bishop@example.com" }), params);
    expect(sentEvents()[0].properties.is_test_org).toBe(true);
  });

  it("does not fire when the invite email fails to send", async () => {
    authAs("clerk@example.com");
    (sendGuardedEmail as jest.Mock).mockResolvedValue({ ok: false, error: "boom" });
    const res = await POST(req({ email: "bishop@example.com" }), params);
    expect(res.status).toBe(502);
    expect(capture).not.toHaveBeenCalled();
  });

  it("does not fire for an ownership handoff invite", async () => {
    authAs("clerk@example.com");
    const res = await POST(req({ email: "bishop@example.com", transferOwnership: true }), params);
    expect(res.status).toBe(201);
    expect(sentEvents()).toEqual([]);
  });
});
