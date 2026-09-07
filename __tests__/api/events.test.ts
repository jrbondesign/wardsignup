/**
 * @jest-environment node
 */

import { POST } from "@/app/api/events/route";
import { NextRequest } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";

jest.mock("@/lib/auth", () => ({
  getAuthFromRequest: jest.fn(),
}));

jest.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: jest.fn() }),
}));

const mockGetAuth = getAuthFromRequest as jest.MockedFunction<
  typeof getAuthFromRequest
>;

describe("/api/events", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST", () => {
    it("should create an event with valid data", async () => {
      let campaignsFromCalls = 0;
      const mockSupabase = {
        from: jest.fn((table: string) => {
          if (table === "organizer_profiles") {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    maybeSingle: jest.fn(() =>
                      Promise.resolve({ data: null, error: null }),
                    ),
                  })),
                })),
              })),
              insert: jest.fn(() => Promise.resolve({ error: null })),
            };
          }
          if (table === "organizations") {
            // getCurrentOrganization() picks the first org for (brand_id, created_by).
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    order: jest.fn(() => ({
                      order: jest.fn(() => ({
                        limit: jest.fn(() => ({
                          maybeSingle: jest.fn(() =>
                            Promise.resolve({
                              data: {
                                id: "test-org-id",
                                name: "Test Org",
                                needs_naming: false,
                                brand_id: "wardsignup",
                              },
                              error: null,
                            }),
                          ),
                        })),
                      })),
                    })),
                  })),
                })),
              })),
            };
          }
          if (table !== "campaigns") {
            return {};
          }
          campaignsFromCalls += 1;
          if (campaignsFromCalls === 1) {
            // Quota count query (RLS-scoped, no .or filter anymore).
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() =>
                  Promise.resolve({ count: 0, error: null }),
                ),
              })),
            };
          }
          return {
            insert: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn(() =>
                  Promise.resolve({
                    data: {
                      id: "test-event-id",
                      name: "Test Event",
                      user_email: "test@example.com",
                      created_by: "test-user-id",
                      organization_id: "test-org-id",
                      created_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                ),
              })),
            })),
          };
        }),
      };
      mockGetAuth.mockResolvedValue({
        ok: true,
        supabase: mockSupabase as any,
        user: { id: "test-user-id", email: "test@example.com" } as any,
      });

      const request = new NextRequest("http://localhost:3000/api/events", {
        method: "POST",
        headers: { Authorization: "Bearer fake-token" },
        body: JSON.stringify({ name: "Test Event" }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.event).toBeDefined();
      expect(data.event.name).toBe("Test Event");
      expect(data.event.user_email).toBe("test@example.com");
    });

    it("should return 400 if name is missing", async () => {
      const mockSupabase = {
        from: jest.fn((table: string) => {
          if (table === "organizer_profiles") {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    maybeSingle: jest.fn(() =>
                      Promise.resolve({ data: { brand_id: "wardsignup" }, error: null }),
                    ),
                  })),
                })),
              })),
            };
          }
          return {};
        }),
      };
      mockGetAuth.mockResolvedValue({
        ok: true,
        supabase: mockSupabase as any,
        user: { id: "u1", email: "a@b.com" } as any,
      });

      const request = new NextRequest("http://localhost:3000/api/events", {
        method: "POST",
        headers: { Authorization: "Bearer fake-token" },
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Event name is required");
    });

    it("should return 400 if name is not a string", async () => {
      const mockSupabase = {
        from: jest.fn((table: string) => {
          if (table === "organizer_profiles") {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    maybeSingle: jest.fn(() =>
                      Promise.resolve({ data: { brand_id: "wardsignup" }, error: null }),
                    ),
                  })),
                })),
              })),
            };
          }
          return {};
        }),
      };
      mockGetAuth.mockResolvedValue({
        ok: true,
        supabase: mockSupabase as any,
        user: { id: "u1", email: "a@b.com" } as any,
      });

      const request = new NextRequest("http://localhost:3000/api/events", {
        method: "POST",
        headers: { Authorization: "Bearer fake-token" },
        body: JSON.stringify({ name: 123 }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Event name is required");
    });

    it("should return 401 if authorization is missing", async () => {
      mockGetAuth.mockResolvedValue({
        ok: false,
        message: "Authorization token required",
        status: 401,
      });

      const request = new NextRequest("http://localhost:3000/api/events", {
        method: "POST",
        body: JSON.stringify({ name: "Test Event" }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Authorization token required");
    });
  });
});
