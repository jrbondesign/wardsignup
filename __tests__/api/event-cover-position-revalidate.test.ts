/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const mockRevalidate = jest.fn();
jest.mock("@/lib/event-page-cache", () => ({
  revalidateEventPage: (...a: unknown[]) => mockRevalidate(...a),
}));
jest.mock("@/lib/auth", () => ({
  getAuthFromRequest: async () => ({ ok: true, supabase: {}, user: { id: "u1" } }),
}));
jest.mock("@/lib/campaign-access", () => ({ userCanAdminCampaign: async () => true }));
let updateError: unknown = null;
jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { organization_id: "org-1" }, error: null }) }) }),
      update: () => ({ eq: async () => ({ error: updateError }) }),
    }),
  }),
}));

import { PATCH } from "@/app/api/events/[id]/cover/route";

const ID = "11111111-1111-4111-8111-111111111111";
const call = () =>
  PATCH(
    new NextRequest(`http://localhost/api/events/${ID}/cover`, {
      method: "PATCH",
      body: JSON.stringify({ position: "50% 20%" }),
    }),
    { params: Promise.resolve({ id: ID }) }
  );

beforeEach(() => {
  process.env.NEXT_PUBLIC_FEATURE_COVER_IMAGE_ORG_IDS = "org-1";
  mockRevalidate.mockReset();
  updateError = null;
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("PATCH /api/events/[id]/cover", () => {
  it("expires the public event page after saving the focal point", async () => {
    expect((await call()).status).toBe(200);
    expect(mockRevalidate).toHaveBeenCalledWith(ID);
  });

  it("does not expire it when the save fails", async () => {
    updateError = { message: "boom" };
    expect((await call()).status).toBe(500);
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});
