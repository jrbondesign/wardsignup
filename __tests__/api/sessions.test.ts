/**
 * @jest-environment node
 */

import { POST } from "@/app/api/sessions/route";
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

describe("/api/sessions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST", () => {
    it("should create sessions with valid data", async () => {
      const sessionRow = {
        id: "session-1",
        campaign_id: "campaign-123",
        day_of_week: 2,
        time: "19:00",
        capacity: 2,
        location: "Test Location",
        notes: null,
      };
      const mockSupabase = {
        from: jest.fn((table: string) => {
          if (table === "campaigns") {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn(() =>
                    Promise.resolve({
                      data: {
                        id: "campaign-123",
                        organization_id: "test-org-id",
                        brand_id: "wardsignup",
                      },
                      error: null,
                    }),
                  ),
                })),
              })),
            };
          }
          if (table === "organization_members") {
            // userCanAdminCampaign() — return an accepted membership row.
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    eq: jest.fn(() => ({
                      limit: jest.fn(() => ({
                        maybeSingle: jest.fn(() =>
                          Promise.resolve({
                            data: { id: "mem-1" },
                            error: null,
                          }),
                        ),
                      })),
                    })),
                  })),
                })),
              })),
            };
          }
          if (table === "sessions") {
            return {
              select: jest.fn((...args: unknown[]) => {
                const opts = args[1] as { count?: string; head?: boolean } | undefined;
                if (opts?.count === "exact" && opts?.head === true) {
                  return {
                    eq: jest.fn(() =>
                      Promise.resolve({ count: 0, error: null }),
                    ),
                  };
                }
                return {};
              }),
              insert: jest.fn(() => ({
                select: jest.fn(() =>
                  Promise.resolve({
                    data: [sessionRow],
                    error: null,
                  }),
                ),
              })),
            };
          }
          return {};
        }),
      };
      mockGetAuth.mockResolvedValue({
        ok: true,
        supabase: mockSupabase as any,
        user: { id: "test-user-id", email: "test@example.com" } as any,
      });

      const request = new NextRequest("http://localhost:3000/api/sessions", {
        method: "POST",
        headers: { Authorization: "Bearer fake-token" },
        body: JSON.stringify({
          campaign_id: "campaign-123",
          sessions: [
            {
              day_of_week: 2,
              time: "19:00",
              capacity: 2,
              location: "Test Location",
              notes: "",
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sessions).toBeDefined();
      expect(Array.isArray(data.sessions)).toBe(true);
      expect(data.sessions.length).toBe(1);
    });

    it("should return 400 if campaign_id is missing", async () => {
      mockGetAuth.mockResolvedValue({
        ok: true,
        supabase: {} as any,
        user: { id: "u1", email: "a@b.com" } as any,
      });

      const request = new NextRequest("http://localhost:3000/api/sessions", {
        method: "POST",
        headers: { Authorization: "Bearer fake-token" },
        body: JSON.stringify({ sessions: [] }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Event ID and sessions array are required");
    });

    it("should return 400 if sessions is not an array", async () => {
      mockGetAuth.mockResolvedValue({
        ok: true,
        supabase: {} as any,
        user: { id: "u1", email: "a@b.com" } as any,
      });

      const request = new NextRequest("http://localhost:3000/api/sessions", {
        method: "POST",
        headers: { Authorization: "Bearer fake-token" },
        body: JSON.stringify({
          campaign_id: "campaign-123",
          sessions: "not an array",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Event ID and sessions array are required");
    });

    it("should return 401 without authorization", async () => {
      mockGetAuth.mockResolvedValue({
        ok: false,
        message: "Authorization token required",
        status: 401,
      });

      const request = new NextRequest("http://localhost:3000/api/sessions", {
        method: "POST",
        body: JSON.stringify({ campaign_id: "x", sessions: [] }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });
  });
});
