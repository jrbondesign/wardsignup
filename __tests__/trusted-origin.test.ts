/**
 * @jest-environment node
 */

import { trustedAuthOriginFromRequest } from "@/lib/brand/request-origin";

function req(headers: Record<string, string>, url = "https://wardsignup.com/api") {
  return new Request(url, { headers });
}

describe("trustedAuthOriginFromRequest", () => {
  it("allows brand hosts", () => {
    expect(
      trustedAuthOriginFromRequest(
        req({ host: "wardsignup.com", "x-forwarded-proto": "https" }),
      ),
    ).toBe("https://wardsignup.com");
  });

  it("allows localhost with port", () => {
    expect(
      trustedAuthOriginFromRequest(req({ host: "localhost:3000" }, "http://localhost:3000/api")),
    ).toBe("http://localhost:3000");
  });

  it("rejects preview and unknown hosts", () => {
    expect(
      trustedAuthOriginFromRequest(
        req({ host: "wardsignup-git-preview.vercel.app", "x-forwarded-proto": "https" }),
      ),
    ).toBeNull();
    expect(
      trustedAuthOriginFromRequest(
        req({ host: "evil.example", "x-forwarded-proto": "https" }),
      ),
    ).toBeNull();
  });
});
