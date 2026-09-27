/**
 * @jest-environment node
 */

import { DELETE } from "@/app/api/admin/signups/[id]/route";
import { NextRequest } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAdminCampaign } from "@/lib/campaign-access";

jest.mock("@/lib/auth", () => ({
  getAuthFromRequest: jest.fn(),
}));

jest.mock("@/lib/campaign-access", () => ({
  userCanAdminCampaign: jest.fn(),
}));

const mockGetAuth = getAuthFromRequest as jest.MockedFunction<typeof getAuthFromRequest>;
const mockCanAdmin = userCanAdminCampaign as jest.MockedFunction<typeof userCanAdminCampaign>;

function req() {
  return new NextRequest("http://localhost:3000/api/admin/signups/sig-1", { method: "DELETE" });
}

describe("DELETE /api/admin/signups/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("refuses delete when the caller is not an org member", async () => {
    const from = jest.fn((table: string) => {
      if (table === "signups") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { id: "sig-1", campaign_id: "c1" }, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { organization_id: "org-1" }, error: null }),
          }),
        }),
      };
    });
    mockGetAuth.mockResolvedValue({
      ok: true,
      supabase: { from } as any,
      user: { id: "u1" } as any,
    });
    mockCanAdmin.mockResolvedValue(false);

    const response = await DELETE(req(), { params: Promise.resolve({ id: "sig-1" }) });
    expect(response.status).toBe(403);
  });

  it("deletes after an admin membership check", async () => {
    const delEq = jest.fn(() => Promise.resolve({ error: null }));
    const from = jest.fn((table: string) => {
      if (table === "signups") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { id: "sig-1", campaign_id: "c1" }, error: null }),
            }),
          }),
          delete: () => ({ eq: delEq }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { organization_id: "org-1" }, error: null }),
          }),
        }),
      };
    });
    mockGetAuth.mockResolvedValue({
      ok: true,
      supabase: { from } as any,
      user: { id: "u1" } as any,
    });
    mockCanAdmin.mockResolvedValue(true);

    const response = await DELETE(req(), { params: Promise.resolve({ id: "sig-1" }) });
    expect(response.status).toBe(200);
    expect(delEq).toHaveBeenCalledWith("id", "sig-1");
  });
});
