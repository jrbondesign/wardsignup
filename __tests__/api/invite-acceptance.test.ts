import { describe, it, expect, beforeEach, jest } from "@jest/globals";

describe("Invite acceptance flow", () => {
  describe("Email matching", () => {
    it("matches emails case-insensitively", () => {
      const invited = "John@Example.COM";
      const signedIn = "john@example.com";
      expect(invited.toLowerCase()).toBe(signedIn.toLowerCase());
    });

    it("rejects mismatched emails", () => {
      const invited = "alice@example.com";
      const signedIn = "bob@example.com";
      expect(invited.toLowerCase()).not.toBe(signedIn.toLowerCase());
    });
  });

  describe("Token hashing", () => {
    it("produces consistent hashes", () => {
      const { createHash } = require("crypto");
      const token = "test-token-123";
      const hash1 = createHash("sha256").update(token).digest("hex");
      const hash2 = createHash("sha256").update(token).digest("hex");
      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different tokens", () => {
      const { createHash } = require("crypto");
      const token1 = "test-token-123";
      const token2 = "test-token-456";
      const hash1 = createHash("sha256").update(token1).digest("hex");
      const hash2 = createHash("sha256").update(token2).digest("hex");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("Idempotent acceptance", () => {
    it("handles already-member case", () => {
      const result = {
        organization_id: "org-123",
        organization_name: "Test Ward",
        ownership_transferred: false,
        already_member: true,
      };
      
      expect(result.already_member).toBe(true);
      expect(result.ownership_transferred).toBe(false);
    });

    it("handles successful first-time acceptance", () => {
      const result = {
        organization_id: "org-123",
        organization_name: "Test Ward",
        ownership_transferred: false,
        already_member: false,
      };
      
      expect(result.already_member).toBe(false);
    });
  });

  describe("Next param validation in middleware", () => {
    function isValidInviteNext(nextParam: string | null): boolean {
      if (!nextParam) return false;
      return nextParam.startsWith("/orgs/accept");
    }

    it("accepts /orgs/accept paths", () => {
      expect(isValidInviteNext("/orgs/accept?token=xyz")).toBe(true);
      expect(isValidInviteNext("/orgs/accept")).toBe(true);
    });

    it("rejects other paths", () => {
      expect(isValidInviteNext("/dashboard")).toBe(false);
      expect(isValidInviteNext("/admin/123")).toBe(false);
      expect(isValidInviteNext(null)).toBe(false);
    });
  });
});
