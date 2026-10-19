import { ensureOrganizerBrandMatchesHost } from "@/lib/organizer-profile";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicBrand } from "@/lib/brand";

const mockBrand = {
  id: "wardsignup",
  publicName: "WardSignup",
  tagline: "Ward signups made easy",
  supportEmail: "support@wardsignup.com",
  shortName: "WardSignup",
} as unknown as PublicBrand;

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
                data: { brand_id: "wardsignup", first_touch_utm_source: null, heard_about_choice: null },
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
                data: { brand_id: "wardsignup", first_touch_utm_source: "existing", heard_about_choice: null },
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
    expect(updatedData.length).toBe(0);
  });

  it("should write heard_about when creating a new profile", async () => {
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

    const heardAbout = {
      choice: "friend_or_ward",
    };

    const result = await ensureOrganizerBrandMatchesHost(
      mockSupabase,
      "user123",
      mockBrand,
      null,
      heardAbout,
    );

    expect(result.ok).toBe(true);
    expect(insertedData.length).toBe(1);
    expect(insertedData[0]).toMatchObject({
      user_id: "user123",
      brand_id: "wardsignup",
      heard_about_choice: "friend_or_ward",
    });
    expect(insertedData[0].heard_about_answered_at).toBeDefined();
  });

  it("should write heard_about with other_text when choice is other", async () => {
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

    const heardAbout = {
      choice: "other",
      other_text: "From a blog post",
    };

    const result = await ensureOrganizerBrandMatchesHost(
      mockSupabase,
      "user123",
      mockBrand,
      null,
      heardAbout,
    );

    expect(result.ok).toBe(true);
    expect(insertedData.length).toBe(1);
    expect(insertedData[0]).toMatchObject({
      user_id: "user123",
      brand_id: "wardsignup",
      heard_about_choice: "other",
      heard_about_other_text: "From a blog post",
    });
    expect(insertedData[0].heard_about_answered_at).toBeDefined();
  });

  it("should update heard_about on existing profile when columns are null", async () => {
    const updatedData: Record<string, unknown>[] = [];
    const mockSupabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { brand_id: "wardsignup", first_touch_utm_source: null, heard_about_choice: null },
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

    const heardAbout = {
      choice: "search",
    };

    const result = await ensureOrganizerBrandMatchesHost(
      mockSupabase,
      "user123",
      mockBrand,
      null,
      heardAbout,
    );

    expect(result.ok).toBe(true);
    expect(updatedData.length).toBe(1);
    expect(updatedData[0]).toMatchObject({
      heard_about_choice: "search",
    });
    expect(updatedData[0].heard_about_answered_at).toBeDefined();
  });

  it("should not update heard_about when columns are already set", async () => {
    const updatedData: Record<string, unknown>[] = [];
    const mockSupabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { brand_id: "wardsignup", first_touch_utm_source: null, heard_about_choice: "existing" },
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

    const heardAbout = {
      choice: "facebook",
    };

    const result = await ensureOrganizerBrandMatchesHost(
      mockSupabase,
      "user123",
      mockBrand,
      null,
      heardAbout,
    );

    expect(result.ok).toBe(true);
    expect(updatedData.length).toBe(0);
  });
});
