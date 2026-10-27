import { getMaxCampaignsForOrg } from "@/lib/limits";
import { checkEventLimit } from "@/lib/event-limit";
import type { SupabaseClient } from "@supabase/supabase-js";

const SWEETWATER_A = "ab5867a1-c1a3-452e-a265-8419ed34bdb4";
const SWEETWATER_B = "d3832817-8aa6-4ba1-96ab-9b0e23d5af4c";
const OTHER_ORG = "11111111-2222-3333-4444-555555555555";

function countingClient(count: number): SupabaseClient {
  const eq = jest.fn().mockResolvedValue({ count, error: null });
  const select = jest.fn().mockReturnValue({ eq });
  return { from: jest.fn().mockReturnValue({ select }) } as unknown as SupabaseClient;
}

describe("getMaxCampaignsForOrg", () => {
  it("gives the Sweetwater Branch org ids a limit of 5", () => {
    expect(getMaxCampaignsForOrg(SWEETWATER_A)).toBe(5);
    expect(getMaxCampaignsForOrg(SWEETWATER_B)).toBe(5);
    expect(getMaxCampaignsForOrg(SWEETWATER_B.toUpperCase())).toBe(5);
  });

  it("returns null for other orgs and missing ids", () => {
    expect(getMaxCampaignsForOrg(OTHER_ORG)).toBeNull();
    expect(getMaxCampaignsForOrg(null)).toBeNull();
    expect(getMaxCampaignsForOrg(undefined)).toBeNull();
    expect(getMaxCampaignsForOrg("")).toBeNull();
  });

  it("does not match on org name", () => {
    expect(getMaxCampaignsForOrg("Sweetwater Branch")).toBeNull();
    expect(getMaxCampaignsForOrg("sweetwater branch")).toBeNull();
  });
});

describe("checkEventLimit per-org override", () => {
  const user = { email: "leader@example.org" };
  const ORIGINAL = process.env.NEXT_PUBLIC_MAX_CAMPAIGNS_PER_USER;
  beforeAll(() => {
    process.env.NEXT_PUBLIC_MAX_CAMPAIGNS_PER_USER = "3";
  });
  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_MAX_CAMPAIGNS_PER_USER;
    else process.env.NEXT_PUBLIC_MAX_CAMPAIGNS_PER_USER = ORIGINAL;
  });

  it("lets the Sweetwater org id create up to 5 events", async () => {
    await expect(checkEventLimit(countingClient(4), user, "wardsignup", SWEETWATER_B)).resolves.toEqual({ ok: true });
    const atCap = await checkEventLimit(countingClient(5), user, "wardsignup", SWEETWATER_B);
    expect(atCap).toMatchObject({ ok: false, status: 403 });
  });

  it("keeps 5 after the Sweetwater org is renamed, since only the id is used", async () => {
    // A rename (or moving "Sweetwater Branch" into Ward/Unit) leaves the id unchanged.
    await expect(checkEventLimit(countingClient(4), user, "wardsignup", SWEETWATER_A)).resolves.toEqual({ ok: true });
  });

  it("does not give a different org named Sweetwater Branch the override", async () => {
    const res = await checkEventLimit(countingClient(3), user, "wardsignup", OTHER_ORG);
    expect(res).toMatchObject({ ok: false, status: 403 });
    if (!res.ok) expect(res.error).toContain("up to 3 events");
  });
});
