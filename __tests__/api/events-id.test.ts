/**
 * @jest-environment node
 */

import { PATCH } from "@/app/api/events/[id]/route";
import { NextRequest } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAdminCampaign } from "@/lib/campaign-access";

jest.mock("@/lib/auth", () => ({
  getAuthFromRequest: jest.fn(),
}));

jest.mock("@/lib/campaign-access", () => ({
  userCanAdminCampaign: jest.fn(),
  userCanDeleteCampaign: jest.fn(),
}));

jest.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: jest.fn() }),
}));

const mockGetAuth = getAuthFromRequest as jest.MockedFunction<
  typeof getAuthFromRequest
>;
const mockCanAdmin = userCanAdminCampaign as jest.MockedFunction<
  typeof userCanAdminCampaign
>;

const EVENT_ID = "22222222-2222-2222-2222-222222222222";

describe("PATCH /api/events/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanAdmin.mockResolvedValue(true);
  });

  it("writes list_on_directory so uncheck hides the event from the ward directory", async () => {
    const update = jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() =>
            Promise.resolve({
              data: { id: EVENT_ID, list_on_directory: false },
              error: null,
            }),
          ),
        })),
      })),
    }));

    mockGetAuth.mockResolvedValue({
      ok: true,
      user: { id: "admin-user" } as never,
      supabase: {
        from: jest.fn((table: string) => {
          if (table !== "campaigns") return {};
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn(() =>
                  Promise.resolve({
                    data: {
                      id: EVENT_ID,
                      brand_id: "wardsignup",
                      organization_id: "org-1",
                      name: "Ward dinner",
                      list_on_directory: true,
                    },
                    error: null,
                  }),
                ),
              })),
            })),
            update,
          };
        }),
      } as never,
    });

    const request = new NextRequest(`http://localhost/api/events/${EVENT_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ list_on_directory: false }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ list_on_directory: false });
    expect(data.event.list_on_directory).toBe(false);
  });
});
