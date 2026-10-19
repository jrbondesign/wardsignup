import { SignupFunnelTracker, buildFunnelProps, isLikelyEmail, type FunnelContext } from "@/lib/signup-funnel";
import { orgIdForCampaign } from "@/lib/analytics-context";

const ORG = "11111111-2222-4333-8444-555555555555";
const CAMPAIGN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ctx: FunnelContext = { orgId: ORG, campaignId: CAMPAIGN, sheetType: "spots" };

describe("buildFunnelProps", () => {
  it("always carries org_id, campaign_id, event_id and sheet_type", () => {
    expect(buildFunnelProps(ctx, { session_count: 2 })).toEqual({
      session_count: 2,
      org_id: ORG,
      campaign_id: CAMPAIGN,
      event_id: CAMPAIGN,
      sheet_type: "spots",
    });
  });

  it("keeps org_id null when unknown instead of dropping it", () => {
    expect(buildFunnelProps({ ...ctx, orgId: null }).org_id).toBeNull();
  });

  it("extra props cannot override the ids", () => {
    const p = buildFunnelProps(ctx, { campaign_id: "spoofed", org_id: "spoofed" });
    expect(p.campaign_id).toBe(CAMPAIGN);
    expect(p.org_id).toBe(ORG);
  });
});

describe("isLikelyEmail", () => {
  it.each([
    ["jane@example.com", true],
    ["  jane@example.org  ", true],
    ["jane@", false],
    ["jane@example", false],
    ["", false],
    [null, false],
    ["two words@example.com", false],
  ])("%p -> %p", (v, want) => {
    expect(isLikelyEmail(v as string | null)).toBe(want);
  });
});

describe("SignupFunnelTracker", () => {
  it("fires each step at most once per page view", () => {
    const capture = jest.fn();
    const t = new SignupFunnelTracker(capture);
    t.sheetViewed(ctx, { slot_count: 3 });
    t.sheetViewed(ctx, { slot_count: 3 });
    t.formStarted(ctx, "slots", "slot_selected");
    t.formStarted(ctx, "slots", "field_focus");
    t.emailEntered(ctx, "slots", "jane@example.com");
    t.emailEntered(ctx, "slots", "other@example.com");
    expect(capture.mock.calls.map((c) => c[0])).toEqual([
      "sheet_viewed",
      "signup_form_started",
      "signup_email_entered",
    ]);
  });

  it("does not fire signup_email_entered for an invalid email, and fires later for a valid one", () => {
    const capture = jest.fn();
    const t = new SignupFunnelTracker(capture);
    expect(t.emailEntered(ctx, "item", "jane@")).toBe(false);
    expect(capture).not.toHaveBeenCalled();
    expect(t.emailEntered(ctx, "item", "jane@example.com")).toBe(true);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("never sends the email or any PII in properties", () => {
    const capture = jest.fn();
    const t = new SignupFunnelTracker(capture);
    t.emailEntered(ctx, "slots", "jane.secret@example.com");
    const props = capture.mock.calls[0][1];
    expect(JSON.stringify(props)).not.toContain("jane");
    expect(JSON.stringify(props)).not.toContain("example.com");
    expect(Object.keys(props).sort()).toEqual(["campaign_id", "event_id", "form", "org_id", "sheet_type"]);
  });

  it("a throwing capture never breaks the page", () => {
    const t = new SignupFunnelTracker(() => {
      throw new Error("posthog down");
    });
    expect(() => t.sheetViewed(ctx)).not.toThrow();
  });
});

describe("orgIdForCampaign", () => {
  const adminReturning = (result: { data: unknown; error: unknown } | Error) => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)),
        }),
      }),
    }),
  });

  it("returns the org id", async () => {
    await expect(orgIdForCampaign(adminReturning({ data: { organization_id: ORG }, error: null }), CAMPAIGN)).resolves.toBe(ORG);
  });

  it("returns null on error, missing row, bad value, no admin or no campaign", async () => {
    await expect(orgIdForCampaign(adminReturning({ data: null, error: { message: "x" } }), CAMPAIGN)).resolves.toBeNull();
    await expect(orgIdForCampaign(adminReturning({ data: null, error: null }), CAMPAIGN)).resolves.toBeNull();
    await expect(orgIdForCampaign(adminReturning({ data: { organization_id: "nope" }, error: null }), CAMPAIGN)).resolves.toBeNull();
    await expect(orgIdForCampaign(adminReturning(new Error("network")), CAMPAIGN)).resolves.toBeNull();
    await expect(orgIdForCampaign(null, CAMPAIGN)).resolves.toBeNull();
    await expect(orgIdForCampaign(adminReturning({ data: { organization_id: ORG }, error: null }), null)).resolves.toBeNull();
  });
});
