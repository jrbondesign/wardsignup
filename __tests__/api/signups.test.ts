/**
 * @jest-environment node
 */

import { POST } from "@/app/api/signups/route";
import { NextRequest } from "next/server";
import { createSignupIfCapacityRpc } from "@/lib/supabase";

jest.mock("@/lib/supabase", () => ({
  createSignupIfCapacityRpc: jest.fn(),
}));

jest.mock("@/lib/participant-email", () => ({
  sendParticipantSignupConfirmation: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: jest.fn() }),
}));

const mockRpc = createSignupIfCapacityRpc as jest.MockedFunction<
  typeof createSignupIfCapacityRpc
>;

describe("/api/signups", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST", () => {
    it("should create a signup with valid data", async () => {
      mockRpc.mockResolvedValue({
        data: {
          id: "signup-1",
          session_id: "session-123",
          campaign_id: "campaign-123",
          member_name: "John Doe",
          member_email: "john@test.com",
          member_phone: "555-1234",
          signed_up_at: new Date().toISOString(),
          reminder_sent_at: null,
        },
        error: null,
      });

      const request = new NextRequest("http://localhost:3000/api/signups", {
        method: "POST",
        body: JSON.stringify({
          session_id: "session-123",
          campaign_id: "campaign-123",
          member_name: "John Doe",
          member_email: "john@test.com",
          member_phone: "555-1234",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.signup).toBeDefined();
      expect(data.signup.member_name).toBe("John Doe");
      expect(mockRpc).toHaveBeenCalledWith({
        p_session_id: "session-123",
        p_campaign_id: "campaign-123",
        p_member_name: "John Doe",
        p_member_email: "john@test.com",
        p_member_phone: "555-1234",
        p_guest_names: [],
      });
    });

    it("should return 400 if session is full", async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: "SESSION_FULL" },
      });

      const request = new NextRequest("http://localhost:3000/api/signups", {
        method: "POST",
        body: JSON.stringify({
          session_id: "session-123",
          campaign_id: "campaign-123",
          member_name: "John Doe",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("This slot is already full");
    });

    it("should return 400 if required fields are missing", async () => {
      const request = new NextRequest("http://localhost:3000/api/signups", {
        method: "POST",
        body: JSON.stringify({
          session_id: "session-123",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe(
        "Slot ID, event ID, and name are required"
      );
    });
  });
});
