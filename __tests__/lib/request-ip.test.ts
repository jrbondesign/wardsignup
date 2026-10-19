/**
 * @jest-environment node
 */
import { getClientIp } from "@/lib/request-ip";

const req = (headers: Record<string, string>) =>
  new Request("https://example.com", { headers });

describe("getClientIp", () => {
  it("prefers x-vercel-forwarded-for over spoofable headers", () => {
    expect(
      getClientIp(req({ "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "6.6.6.6" })),
    ).toBe("1.1.1.1");
  });

  it("falls back to x-real-ip, then x-forwarded-for", () => {
    expect(getClientIp(req({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "6.6.6.6" }))).toBe("2.2.2.2");
    expect(getClientIp(req({ "x-forwarded-for": "3.3.3.3, 4.4.4.4" }))).toBe("3.3.3.3");
  });

  it("returns unknown with no headers", () => {
    expect(getClientIp(req({}))).toBe("unknown");
  });
});
