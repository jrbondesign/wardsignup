import { getCurrentOrganization } from "@/lib/organizations";

describe("getCurrentOrganization", () => {
  it("ignores a saved org without an accepted membership", async () => {
    const maybeSingle = jest
      .fn()
      .mockResolvedValueOnce({ data: { selected_org_id: "org-stale" } })
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({
        data: { id: "org-own", name: "Mine", needs_naming: false, brand_id: "wardsignup" },
      });
    const eq = jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle, eq: jest.fn(() => ({ maybeSingle })) })) }));
    const select = jest.fn(() => ({ eq }));
    const order = jest.fn(() => ({
      order: jest.fn(() => ({
        limit: jest.fn(() => ({ maybeSingle })),
      })),
    }));
    const from = jest.fn((table: string) => {
      if (table === "organizer_profiles") {
        return { select: jest.fn(() => ({ eq: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle })) })) })) };
      }
      if (table === "organization_members") {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({ maybeSingle })),
              })),
            })),
          })),
        };
      }
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              order,
            })),
          })),
        })),
      };
    });

    const org = await getCurrentOrganization({ from } as never, { id: "u1" }, "wardsignup");
    expect(org?.id).toBe("org-own");
    expect(from).toHaveBeenCalledWith("organization_members");
  });
});
