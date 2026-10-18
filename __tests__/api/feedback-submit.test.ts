/**
 * @jest-environment node
 */

import { POST } from "@/app/api/feedback/[token]/route";
import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { sendFeedbackResponseNotification } from "@/lib/feedback-email";
import { consumeActionRate } from "@/lib/rate-limit";
import { getPostHogClient } from "@/lib/posthog-server";

jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: jest.fn(),
}));

jest.mock("@/lib/feedback-email", () => ({
  sendFeedbackResponseNotification: jest.fn(),
}));

jest.mock("@/lib/rate-limit", () => ({
  consumeActionRate: jest.fn(),
}));

jest.mock("@/lib/posthog-server", () => ({
  getPostHogClient: jest.fn(),
}));

jest.mock("@/lib/brand", () => ({
  publicSiteOriginAndBrandForCampaign: jest.fn().mockReturnValue({
    brand: {
      id: "wardsignup",
      name: "WardSignup",
      siteUrl: "https://wardsignup.com",
    },
  }),
}));

const mockSendNotification = sendFeedbackResponseNotification as jest.MockedFunction<
  typeof sendFeedbackResponseNotification
>;
const mockConsumeRate = consumeActionRate as jest.MockedFunction<
  typeof consumeActionRate
>;
const mockCreateClient = createServiceRoleClient as jest.MockedFunction<
  typeof createServiceRoleClient
>;
const mockGetPostHog = getPostHogClient as jest.MockedFunction<
  typeof getPostHogClient
>;

describe("/api/feedback/[token]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

    mockConsumeRate.mockResolvedValue({ allowed: true } as any);
    mockGetPostHog.mockReturnValue({
      capture: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
    } as any);
  });

  afterEach(() => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  describe("POST", () => {
    it("sends immediate notification on successful feedback submission", async () => {
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: "req-1",
            user_id: "user-123",
            brand_id: "wardsignup",
            email_lower: "creator@test.com",
          },
          error: null,
        }),
      });

      const mockFrom = jest.fn().mockReturnValue({
        update: mockUpdate,
      });

      mockCreateClient.mockReturnValue({
        from: mockFrom,
      } as any);

      mockSendNotification.mockResolvedValue({ ok: true });

      const request = new NextRequest(
        "http://localhost:3000/api/feedback/abc123def456",
        {
          method: "POST",
          body: JSON.stringify({
            pmf: "very",
            retention: "definitely",
            value: "Great product!",
            friction: "Needs better mobile UI",
          }),
        },
      );

      const response = await POST(request, {
        params: Promise.resolve({ token: "abc123def456" }),
      });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      expect(mockSendNotification).toHaveBeenCalledWith({
        brand: expect.objectContaining({
          id: "wardsignup",
          name: "WardSignup",
        }),
        creatorEmail: "creator@test.com",
        pmf: "very",
        retention: "definitely",
        value: "Great product!",
        blocker: "Needs better mobile UI",
        respondedAt: expect.any(String),
      });
    });

    it("does not send notification on duplicate submission (409)", async () => {
      // First call: no update (already responded)
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      });

      // Second call: check if existing
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: "req-1" },
          error: null,
        }),
      });

      const mockFrom = jest.fn((table: string) => {
        if (table === "feedback_requests") {
          return {
            update: mockUpdate,
            select: mockSelect,
          };
        }
        return {};
      });

      mockCreateClient.mockReturnValue({
        from: mockFrom,
      } as any);

      const request = new NextRequest(
        "http://localhost:3000/api/feedback/abc123def456",
        {
          method: "POST",
          body: JSON.stringify({
            pmf: "very",
          }),
        },
      );

      const response = await POST(request, {
        params: Promise.resolve({ token: "abc123def456" }),
      });

      expect(response.status).toBe(409);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("still saves feedback even if email notification fails", async () => {
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: "req-1",
            user_id: "user-123",
            brand_id: "wardsignup",
            email_lower: "creator@test.com",
          },
          error: null,
        }),
      });

      const mockFrom = jest.fn().mockReturnValue({
        update: mockUpdate,
      });

      mockCreateClient.mockReturnValue({
        from: mockFrom,
      } as any);

      // Email notification fails
      mockSendNotification.mockResolvedValue({
        ok: false,
        error: "Email service unavailable",
      });

      const request = new NextRequest(
        "http://localhost:3000/api/feedback/abc123def456",
        {
          method: "POST",
          body: JSON.stringify({
            pmf: "very",
          }),
        },
      );

      const response = await POST(request, {
        params: Promise.resolve({ token: "abc123def456" }),
      });
      const json = await response.json();

      // Request still succeeds
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockSendNotification).toHaveBeenCalledTimes(1);
    });

    it("requires pmf answer", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/feedback/abc123def456",
        {
          method: "POST",
          body: JSON.stringify({
            retention: "definitely",
          }),
        },
      );

      const response = await POST(request, {
        params: Promise.resolve({ token: "abc123def456" }),
      });

      expect(response.status).toBe(400);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("includes full text of all answers in notification", async () => {
      const longValue = "This is a very detailed answer about what makes the product valuable. It includes multiple sentences and specific examples of features that creators appreciate. The response can be quite lengthy and should be preserved in full.";
      const longBlocker = "Here is detailed feedback about friction points. It might include multiple paragraphs, specific bugs, and feature requests that need to be addressed. Every word matters for product improvement.";

      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: "req-1",
            user_id: "user-123",
            brand_id: "wardsignup",
            email_lower: "creator@test.com",
          },
          error: null,
        }),
      });

      const mockFrom = jest.fn().mockReturnValue({
        update: mockUpdate,
      });

      mockCreateClient.mockReturnValue({
        from: mockFrom,
      } as any);

      mockSendNotification.mockResolvedValue({ ok: true });

      const request = new NextRequest(
        "http://localhost:3000/api/feedback/abc123def456",
        {
          method: "POST",
          body: JSON.stringify({
            pmf: "very",
            retention: "definitely",
            value: longValue,
            friction: longBlocker,
          }),
        },
      );

      await POST(request, {
        params: Promise.resolve({ token: "abc123def456" }),
      });

      expect(mockSendNotification).toHaveBeenCalledWith({
        brand: expect.any(Object),
        creatorEmail: "creator@test.com",
        pmf: "very",
        retention: "definitely",
        value: longValue,
        blocker: longBlocker,
        respondedAt: expect.any(String),
      });

      // Verify full text is passed, not summaries
      const call = mockSendNotification.mock.calls[0][0];
      expect(call.value).toBe(longValue);
      expect(call.blocker).toBe(longBlocker);
    });
  });
});
