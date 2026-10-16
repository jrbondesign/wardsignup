import { ensureOrganizerBrandMatchesHost } from "@/lib/organizer-profile";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicBrand } from "@/lib/brand";

const mockBrand: PublicBrand = {
  id: "wardsignup",
  publicName: "WardSignup",
  tagline: "Ward signups made easy",
  supportEmail: "support@wardsignup.com",
  shortName: "WardSignup",
};

describe("ensureOrganizerBrandMatchesHost", () => {
  it("should write attribution when creating a new profile", async () => {
    const insertedData: Record<string, unknown>[] = [];
    const mockSupabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
        insert: jest.fn((data) => {
          insertedData.push(data);
          return { error: null };
        }),
      }),
    } as unknown as SupabaseClient;

    const attribution = {
      first_touch_utm_source: "email",
      first_touch_utm_medium: "email",
      first_touch_utm_campaign: "welcome",
      first_touch_ref: "share",
    };

    const result = await ensureOrganizerBrandMatchesHost(
      mockSupabase,
      "user123",
      mockBrand,
      attribution,
    );

    expect(result.ok).toBe(true);
    expect(insertedData.length).toBe(1);
    expect(insertedData[0]).toMatchObject({
      user_id: "user123",
      brand_id: "wardsignup",
      first_touch_utm_source: "email",
      first_touch_utm_medium: "email",
      first_touch_utm_campaign: "welcome",
      first_touch_ref: "share",
    });
    expect(insertedData[0].first_touch_captured_at).toBeDefined();
  });

  it("should not write attribution when creating profile without attribution", async () => {
    const insertedData: Record<string, unknown>[] = [];
    const mockSupabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
        insert: jest.fn((data) => {
          insertedData.push(data);
          return { error: null };
        }),
      }),
    } as unknown as SupabaseClient;

    const result = await ensureOrganizerBrandMatchesHost(
      mockSupabase,
      "user123",
      mockBrand,
      null,
    );

    expect(result.ok).toBe(true);
    expect(insertedData.length).toBe(1);
    expect(insertedData[0]).toEqual({
      user_id: "user123",
      brand_id: "wardsignup",
    });
  });

  it("should update attribution on existing profile when columns are null", async () => {
    const updatedData: Record<string, unknown>[] = [];
    const mockSupabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { brand_id: "wardsignup", first_touch_utm_source: null },
                error: null,
              }),
            }),
          }),
        }),
        update: jest.fn((data) => {
          updatedData.push(data);
          return {
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                is: jest.fn().mockResolvedValue({ error: null }),
              }),
            }),
          };
        }),
      }),
    } as unknown as SupabaseClient;

    const attribution = {
      first_touch_utm_source: "qr",
      first_touch_utm_medium: "print",
      first_touch_utm_campaign: "event_qr",
    };

    const result = await ensureOrganizerBrandMatchesHost(
      mockSupabase,
      "user123",
      mockBrand,
      attribution,
    );

    expect(result.ok).toBe(true);
    expect(updatedData.length).toBe(1);
    expect(updatedData[0]).toMatchObject({
      first_touch_utm_source: "qr",
      first_touch_utm_medium: "print",
      first_touch_utm_campaign: "event_qr",
    });
    expect(updatedData[0].first_touch_captured_at).toBeDefined();
  });

  it("should not update attribution when columns are already set", async () => {
    const updatedData: Record<string, unknown>[] = [];
    const mockSupabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { brand_id: "wardsignup", first_touch_utm_source: "existing" },
                error: null,
              }),
            }),
          }),
        }),
        update: jest.fn((data) => {
          updatedData.push(data);
          return {
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                is: jest.fn().mockResolvedValue({ error: null }),
              }),
            }),
          };
        }),
      }),
    } as unknown as SupabaseClient;

    const attribution = {
      first_touch_utm_source: "qr",
      first_touch_utm_medium: "print",
    };

    const result = await ensureOrganizerBrandMatchesHost(
      mockSupabase,
      "user123",
      mockBrand,
      attribution,
    );

    expect(result.ok).toBe(true);
    expect(updatedData.length).toBe(0); // No update should be attempted
  });
});
