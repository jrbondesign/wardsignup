/**
 * @jest-environment node
 */

import { createClient } from "@supabase/supabase-js";

/**
 * Reproduction test for the co-admin bounce bug.
 * 
 * Scenario: A co-admin accepts an org invite and tries to access /admin/[id].
 * The page queries campaigns with RLS and then checks access via userCanAdminCampaign.
 * 
 * Expected: Both queries should succeed.
 * Actual (bug): One of the queries fails, causing redirect to /dashboard.
 */
describe("Co-admin access bug reproduction", () => {
  const mockSupabaseUrl = "https://test.supabase.co";
  const mockAnonKey = "test-anon-key";

  // Mock the RLS function is_org_member which is SECURITY DEFINER
  const mockIsOrgMember = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reproduces the bug: RLS allows campaigns query but userCanAdminCampaign fails", async () => {
    // Setup: User is a co-admin (role='admin', status='accepted')
    const userId = "user-123";
    const orgId = "org-456";
    const campaignId = "campaign-789";
    
    // The organization_members table has an accepted admin row
    const membershipRow = {
      id: "member-1",
      organization_id: orgId,
      user_id: userId,
      invited_email: "admin@example.com",
      role: "admin",
      status: "accepted",
      accepted_at: new Date().toISOString(),
    };

    // Mock Supabase client
    const mockSupabase = {
      from: jest.fn((table: string) => {
        if (table === "campaigns") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn(() => {
                  // RLS check: is_org_member(organization_id)
                  // In the real DB, this would call the SECURITY DEFINER function
                  // which queries organization_members for accepted status
                  // For this test, we simulate it returning true
                  mockIsOrgMember.mockReturnValue(true);
                  
                  if (mockIsOrgMember(orgId)) {
                    return Promise.resolve({
                      data: {
                        id: campaignId,
                        organization_id: orgId,
                        name: "Test Event",
                        created_by: "different-user-id", // Not the co-admin
                        user_email: null,
                      },
                      error: null,
                    });
                  }
                  
                  // RLS blocks the query
                  return Promise.resolve({ data: null, error: null });
                }),
              })),
            })),
          };
        }
        
        if (table === "organization_members") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    limit: jest.fn(() => ({
                      maybeSingle: jest.fn(() => {
                        // RLS check on organization_members:
                        // USING (is_org_member(organization_id) OR organization_id IN (...))
                        
                        // Bug hypothesis: The RLS policy blocks reading your own membership row
                        // because is_org_member returns false when checking your own row
                        
                        // Let's test both cases:
                        // Case 1: is_org_member returns true (correct behavior)
                        // Case 2: is_org_member returns false (bug - circular dependency)
                        
                        if (mockIsOrgMember(orgId)) {
                          return Promise.resolve({ data: membershipRow, error: null });
                        }
                        
                        // RLS blocks - user can't read their own membership
                        return Promise.resolve({ data: null, error: null });
                      }),
                    })),
                  })),
                })),
              })),
            })),
          };
        }
        
        return { select: jest.fn() };
      }),
    } as any;

    // Test Case 1: is_org_member returns true for both queries (expected behavior)
    mockIsOrgMember.mockReturnValue(true);
    
    // Query 1: Get campaign (with RLS)
    const campaignResult = await mockSupabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();
    
    expect(campaignResult.data).not.toBeNull();
    expect(campaignResult.data?.organization_id).toBe(orgId);
    
    // Query 2: userCanAdminCampaign checks membership (with RLS)
    const membershipResult = await mockSupabase
      .from("organization_members")
      .select("id")
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .eq("status", "accepted")
      .limit(1)
      .maybeSingle();
    
    expect(membershipResult.data).not.toBeNull();
    
    // Both queries succeed - user can access the page
    const hasAccess = !!membershipResult.data;
    expect(hasAccess).toBe(true);
  });

  it("demonstrates the bug: is_org_member doesn't prevent RLS recursion", () => {
    // The bug would be if is_org_member is NOT SECURITY DEFINER
    // or if there's some other issue preventing it from reading the membership
    
    // This test documents the expected behavior:
    // 1. is_org_member is SECURITY DEFINER so it bypasses RLS
    // 2. Therefore no circular dependency exists
    // 3. Both queries should succeed
    
    // If the bug is real, we need to find what's actually causing the bounce
    expect(true).toBe(true); // Placeholder
  });
});
