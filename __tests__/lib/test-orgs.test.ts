import { TEST_OWNER_EMAILS, TEST_ORG_IDS, isTestOrgId, isTestOwnerEmail } from "@/lib/test-orgs";
import { analyticsContextForCampaign } from "@/lib/analytics-context";

const ORG = "11111111-2222-4333-8444-555555555555";
const CAMPAIGN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const CREATOR = "c0000000-0000-4000-8000-000000000001";
const OWNER = "c0000000-0000-4000-8000-000000000002";

type Res = { data: unknown; error: unknown };

/** Fake service-role client: one canned result per table, plus an auth email map. */
function fakeAdmin(opts: {
  campaign?: Res | Error;
  org?: Res | Error;
  emails?: Record<string, string | null | Error>;
  noAuth?: boolean;
}) {
  const calls: string[] = [];
  const admin = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            calls.push(table);
            const r = table === "campaigns" ? opts.campaign : opts.org;
            if (r instanceof Error) return Promise.reject(r);
            return Promise.resolve(r ?? { data: null, error: null });
          },
        }),
      }),
    }),
    auth: opts.noAuth
      ? undefined
      : {
          admin: {
            getUserById: (id: string) => {
              calls.push(`user:${id}`);
              const e = opts.emails?.[id];
              if (e instanceof Error) return Promise.resolve({ data: null, error: e });
              return Promise.resolve({ data: { user: e === undefined ? null : { email: e } }, error: null });
            },
          },
        },
  };
  return { admin, calls };
}

const campaignRow = (over: Record<string, unknown> = {}): Res => ({
  data: { organization_id: ORG, user_email: null, created_by: CREATOR, ...over },
  error: null,
});
const orgRow = (owner: string | null = OWNER): Res => ({ data: { created_by: owner }, error: null });

describe("test-orgs list", () => {
  it("is exactly the three test owner emails", () => {
    expect([...TEST_OWNER_EMAILS].sort()).toEqual(["bondesign@gmail.com", "jon@jrbond.com", "jonathan@wardsignup.com"]);
  });

  it("matches case and whitespace insensitively, and nothing else", () => {
    expect(isTestOwnerEmail(" Jon@JRBond.com ")).toBe(true);
    expect(isTestOwnerEmail("bondesign+x@gmail.com")).toBe(false);
    expect(isTestOwnerEmail("someone@wardsignup.com")).toBe(false);
    expect(isTestOwnerEmail(null)).toBe(false);
  });

  it("has no org ids listed yet (Sweetwater not confirmed)", () => {
    expect(TEST_ORG_IDS.size).toBe(0);
    expect(isTestOrgId(ORG)).toBe(false);
    expect(isTestOrgId("d3832817-8aa6-4ba1-96ab-9b0e23d5af4c")).toBe(false);
  });
});

describe("analyticsContextForCampaign", () => {
  it("is false for a real ward", async () => {
    const { admin } = fakeAdmin({
      campaign: campaignRow({ user_email: "leader@example.org" }),
      org: orgRow(),
      emails: { [CREATOR]: "leader@example.org", [OWNER]: "bishop@example.org" },
    });
    await expect(analyticsContextForCampaign(admin, CAMPAIGN)).resolves.toEqual({ orgId: ORG, isTestOrg: false });
  });

  it("is true when the campaign user_email is a test email, without auth lookups", async () => {
    const { admin, calls } = fakeAdmin({ campaign: campaignRow({ user_email: "BONDESIGN@gmail.com" }) });
    await expect(analyticsContextForCampaign(admin, CAMPAIGN)).resolves.toEqual({ orgId: ORG, isTestOrg: true });
    expect(calls).toEqual(["campaigns"]);
  });

  it("is true when the campaign creator is a test account", async () => {
    const { admin } = fakeAdmin({ campaign: campaignRow(), org: orgRow(), emails: { [CREATOR]: "jon@jrbond.com", [OWNER]: "x@example.org" } });
    await expect(analyticsContextForCampaign(admin, CAMPAIGN)).resolves.toMatchObject({ isTestOrg: true });
  });

  it("is true when the organization owner is a test account", async () => {
    const { admin } = fakeAdmin({
      campaign: campaignRow(),
      org: orgRow(),
      emails: { [CREATOR]: "helper@example.org", [OWNER]: "jonathan@wardsignup.com" },
    });
    await expect(analyticsContextForCampaign(admin, CAMPAIGN)).resolves.toMatchObject({ isTestOrg: true });
  });

  it("does not treat a ward as test by its name", async () => {
    const { admin } = fakeAdmin({
      campaign: { data: { organization_id: ORG, user_email: "clerk@example.org", created_by: CREATOR, name: "Sweetwater Branch" }, error: null },
      org: { data: { created_by: OWNER, name: "Sweetwater Branch" }, error: null },
      emails: { [CREATOR]: "clerk@example.org", [OWNER]: "clerk@example.org" },
    });
    await expect(analyticsContextForCampaign(admin, CAMPAIGN)).resolves.toMatchObject({ isTestOrg: false });
  });

  it("is null when the campaign lookup fails or finds nothing", async () => {
    for (const campaign of [{ data: null, error: { message: "x" } }, { data: null, error: null }, new Error("network")]) {
      const { admin } = fakeAdmin({ campaign });
      await expect(analyticsContextForCampaign(admin, CAMPAIGN)).resolves.toEqual({ orgId: null, isTestOrg: null });
    }
    await expect(analyticsContextForCampaign(null, CAMPAIGN)).resolves.toEqual({ orgId: null, isTestOrg: null });
    await expect(analyticsContextForCampaign(fakeAdmin({}).admin, null)).resolves.toEqual({ orgId: null, isTestOrg: null });
  });

  it("is null (not false) when the org lookup fails", async () => {
    const { admin } = fakeAdmin({ campaign: campaignRow(), org: { data: null, error: { message: "x" } } });
    await expect(analyticsContextForCampaign(admin, CAMPAIGN)).resolves.toEqual({ orgId: ORG, isTestOrg: null });
  });

  it("is null (not false) when an owner email lookup fails", async () => {
    const { admin } = fakeAdmin({ campaign: campaignRow(), org: orgRow(), emails: { [CREATOR]: "a@example.org", [OWNER]: new Error("auth down") } });
    await expect(analyticsContextForCampaign(admin, CAMPAIGN)).resolves.toEqual({ orgId: ORG, isTestOrg: null });
  });

  it("is still true when one lookup fails but another matched a test email", async () => {
    const { admin } = fakeAdmin({ campaign: campaignRow(), org: orgRow(), emails: { [CREATOR]: new Error("auth down"), [OWNER]: "jon@jrbond.com" } });
    await expect(analyticsContextForCampaign(admin, CAMPAIGN)).resolves.toMatchObject({ isTestOrg: true });
  });

  it("is null when the client has no auth admin and the email is not decisive", async () => {
    const { admin } = fakeAdmin({ campaign: campaignRow(), org: orgRow(), noAuth: true });
    await expect(analyticsContextForCampaign(admin, CAMPAIGN)).resolves.toEqual({ orgId: ORG, isTestOrg: null });
  });

  it("looks the same user up once when creator and owner match", async () => {
    const { admin, calls } = fakeAdmin({ campaign: campaignRow({ created_by: OWNER }), org: orgRow(OWNER), emails: { [OWNER]: "x@example.org" } });
    await analyticsContextForCampaign(admin, CAMPAIGN);
    expect(calls.filter((c) => c.startsWith("user:"))).toEqual([`user:${OWNER}`]);
  });
});
