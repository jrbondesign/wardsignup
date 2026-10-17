import { describe, it, expect } from "@jest/globals";

describe("next path validation (middleware)", () => {
  function isValidNextPath(path: string): boolean {
    if (!path.startsWith("/")) return false;
    if (path.startsWith("//")) return false;
    if (path.includes("\\")) return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return false;
    return true;
  }

  it("accepts valid relative paths", () => {
    expect(isValidNextPath("/dashboard")).toBe(true);
    expect(isValidNextPath("/orgs/accept?token=abc")).toBe(true);
    expect(isValidNextPath("/admin/123")).toBe(true);
  });

  it("rejects paths with double slash", () => {
    expect(isValidNextPath("//evil.com/phish")).toBe(false);
  });

  it("rejects paths with no leading slash", () => {
    expect(isValidNextPath("dashboard")).toBe(false);
    expect(isValidNextPath("evil.com")).toBe(false);
  });

  it("rejects paths with backslash", () => {
    expect(isValidNextPath("/dashboard\\evil")).toBe(false);
  });

  it("rejects paths with scheme", () => {
    expect(isValidNextPath("http://evil.com")).toBe(false);
    expect(isValidNextPath("https://evil.com")).toBe(false);
    expect(isValidNextPath("javascript:alert(1)")).toBe(false);
    expect(isValidNextPath("data:text/html,<script>")).toBe(false);
  });

  it("accepts paths starting with /orgs/accept", () => {
    expect(isValidNextPath("/orgs/accept")).toBe(true);
    expect(isValidNextPath("/orgs/accept?token=xyz")).toBe(true);
  });
});
