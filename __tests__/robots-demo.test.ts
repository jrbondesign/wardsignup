/**
 * @jest-environment node
 */

jest.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "wardsignup.com" }),
}));

import robots from "@/app/robots";

describe("robots.txt", () => {
  it("disallows /demo so review fixtures stay out of search", async () => {
    const manifest = await robots();
    const rules = Array.isArray(manifest.rules) ? manifest.rules : [manifest.rules];
    const disallow = rules.flatMap((r) => {
      const d = r.disallow;
      if (!d) return [];
      return Array.isArray(d) ? d : [d];
    });
    expect(disallow).toContain("/demo");
  });
});
