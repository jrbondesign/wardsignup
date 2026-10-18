import { createOrganization } from "@/lib/organizations";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("createOrganization", () => {
  it("should write attribution when creating an organization", async () => {
    const insertedData: Record<string, unknown>[] = [];
    const mockOrg = {
      id: "org123",
      name: "Test Ward",
      needs_naming: false,
      brand_id: "wardsignup",
    };

    const mockSupabase = {
      from: jest.fn().mockReturnValue({
        insert: jest.fn((data) => {
          insertedData.push(data);
          return {
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: mockOrg,
                error: null,
              }),
            }),
          };
        }),
      }),
    } as unknown as SupabaseClient;

    const attribution = {
      first_touch_utm_source: "signup_confirmation",
      first_touch_utm_medium: "referral",
      first_touch_utm_campaign: "run_your_own",
      first_touch_ref: "share",
    };

    const result = await createOrganization(
      mockSupabase,
      { id: "user123" },
      "wardsignup",
      "Test Ward",
      attribution,
    );

    expect(result.id).toBe("org123");
    expect(insertedData.length).toBe(1);
    expect(insertedData[0]).toMatchObject({
      brand_id: "wardsignup",
      name: "Test Ward",
      created_by: "user123",
      owner_id: "user123",
      needs_naming: false,
      first_touch_utm_source: "signup_confirmation",
      first_touch_utm_medium: "referral",
      first_touch_utm_campaign: "run_your_own",
      first_touch_ref: "share",
    });
    expect(insertedData[0].first_touch_captured_at).toBeDefined();
  });

  it("should not write attribution when none is provided", async () => {
    const insertedData: Record<string, unknown>[] = [];
    const mockOrg = {
      id: "org123",
      name: "Test Ward",
      needs_naming: false,
      brand_id: "wardsignup",
    };

    const mockSupabase = {
      from: jest.fn().mockReturnValue({
        insert: jest.fn((data) => {
          insertedData.push(data);
          return {
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: mockOrg,
                error: null,
              }),
            }),
          };
        }),
      }),
    } as unknown as SupabaseClient;

    const result = await createOrganization(
      mockSupabase,
      { id: "user123" },
      "wardsignup",
      "Test Ward",
      null,
    );

    expect(result.id).toBe("org123");
    expect(insertedData.length).toBe(1);
    expect(insertedData[0]).toEqual({
      brand_id: "wardsignup",
      name: "Test Ward",
      created_by: "user123",
      owner_id: "user123",
      needs_naming: false,
    });
  });
});
