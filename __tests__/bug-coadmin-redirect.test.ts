/**
 * Integration test reproducing the co-admin redirect bug with real production scenario.
 * 
 * Production data:
 * - Campaign f8e7df23, organization 58a4a9fa, created_by Dan (54e922c1)
 * - User kylejens6 (045c4b90) has organization_members row:
 *   role=admin, status=accepted, user_id set, accepted 2026-10-11 15:16 UTC
 * - User was redirected to /dashboard within ~1 second, no exceptions
 * 
 * Bug: Line 230 redirects if hasAccess is false
 * hasAccess = created_by === user.id || user_email === user.email || userCanAdminCampaign
 * 
 * For Kyle: created_by false, user_email false, so userCanAdminCampaign must return false
 * But why? The membership row exists with correct values.
 */

import { userCanAdminCampaign } from "@/lib/campaign-access";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("Co-admin redirect bug - production scenario", () => {
  it("reproduces the redirect: non-creator admin with valid membership", async () => {
    // Production scenario
    const campaignId = "f8e7df23-fake";
    const orgId = "58a4a9fa-fake";
    const creatorId = "54e922c1-fake"; // Dan
    const adminId = "045c4b90-fake"; // Kyle
    
    const campaign = {
      id: campaignId,
      organization_id: orgId,
      created_by: creatorId,
      user_email: null,
    };
    
    const membershipRow = {
      id: "member-1",
      organization_id: orgId,
      user_id: adminId,
      role: "admin",
      status: "accepted",
      accepted_at: "2026-10-11T15:16:00Z",
    };
    
    // Mock Supabase client
    let organizationMembersQuery: any = null;
    
    const mockSupabase = {
      from: jest.fn((table: string) => {
        if (table === "organization_members") {
          return {
            select: jest.fn((cols) => {
              const query = {
                eq: jest.fn((col, val) => {
                  organizationMembersQuery = organizationMembersQuery || {};
                  organizationMembersQuery[col] = val;
                  return query;
                }),
                limit: jest.fn(() => query),
                maybeSingle: jest.fn(() => {
                  // Check if all the filters match
                  if (
                    organizationMembersQuery?.organization_id === orgId &&
                    organizationMembersQuery?.user_id === adminId &&
                    organizationMembersQuery?.status === "accepted"
                  ) {
                    // This should return the row, but maybe RLS blocks it?
                    // Test hypothesis: RLS on organization_members blocks reading your own row
                    return Promise.resolve({ data: membershipRow, error: null });
                  }
                  return Promise.resolve({ data: null, error: null });
                }),
              };
              return query;
            }),
          };
        }
        return { select: jest.fn() };
      }),
    } as unknown as SupabaseClient;
    
    const user = { id: adminId };
    
    // Test the access check logic from the page
    const createdByCheck = campaign.created_by === user.id;
    const userEmailCheck = campaign.user_email === (user as any).email;
    const canAdminCheck = await userCanAdminCampaign(mockSupabase, user, campaign);
    
    const hasAccess = createdByCheck || userEmailCheck || canAdminCheck;
    
    // Debug output
    console.log("Access check results:", {
      createdByCheck,
      userEmailCheck,
      canAdminCheck,
      hasAccess,
    });
    
    // This should be true but production shows it's false
    expect(hasAccess).toBe(true);
  });
});
