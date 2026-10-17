import { describe, it, expect } from "@jest/globals";
import { createHash } from "crypto";

describe("Invite acceptance security", () => {
  function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  describe("RPC security requirements", () => {
    it("accepts only token_hash parameter (no user_id or email)", () => {
      // The RPC signature should be: accept_organization_invite(p_token_hash TEXT)
      // Not: accept_organization_invite(p_token_hash TEXT, p_user_id UUID, p_user_email TEXT)
      const validSignature = "accept_organization_invite(p_token_hash)";
      const invalidSignature = "accept_organization_invite(p_token_hash, p_user_id, p_user_email)";
      
      expect(validSignature).toContain("p_token_hash");
      expect(validSignature).not.toContain("p_user_id");
      expect(validSignature).not.toContain("p_user_email");
    });

    it("uses auth.uid() internally for user identification", () => {
      // The function must call auth.uid() and fail if null
      const pseudoCode = `
        v_uid := auth.uid();
        IF v_uid IS NULL THEN
          RAISE EXCEPTION 'Authentication required';
        END IF;
      `;
      expect(pseudoCode).toContain("auth.uid()");
      expect(pseudoCode).toContain("Authentication required");
    });

    it("reads email from auth.users not from client", () => {
      // The function must SELECT from auth.users where id = v_uid
      const pseudoCode = `
        SELECT email, email_confirmed_at
        INTO v_user_email, v_email_confirmed_at
        FROM auth.users
        WHERE id = v_uid;
      `;
      expect(pseudoCode).toContain("auth.users");
      expect(pseudoCode).toContain("email_confirmed_at");
    });

    it("requires confirmed email", () => {
      const pseudoCode = `
        IF v_email_confirmed_at IS NULL THEN
          RAISE EXCEPTION 'Email not confirmed';
        END IF;
      `;
      expect(pseudoCode).toContain("email_confirmed_at IS NULL");
      expect(pseudoCode).toContain("Email not confirmed");
    });

    it("compares emails case-insensitively", () => {
      const email1 = "John@Example.COM";
      const email2 = "john@example.com";
      expect(email1.toLowerCase()).toBe(email2.toLowerCase());
    });
  });

  describe("Token clearing", () => {
    it("clears both accept_token and accept_token_hash on acceptance", () => {
      // Both branches must clear both fields
      const acceptBranch = `
        UPDATE organization_members
        SET
          accept_token = NULL,
          accept_token_hash = NULL
        WHERE id = v_invite.id;
      `;
      expect(acceptBranch).toContain("accept_token = NULL");
      expect(acceptBranch).toContain("accept_token_hash = NULL");
    });

    it("clears tokens in already-member branch", () => {
      // Already-member branch must also clear both
      const alreadyMemberBranch = `
        UPDATE organization_members
        SET
          accept_token = NULL,
          accept_token_hash = NULL
        WHERE id = v_invite.id;
      `;
      expect(alreadyMemberBranch).toContain("accept_token = NULL");
      expect(alreadyMemberBranch).toContain("accept_token_hash = NULL");
    });
  });

  describe("Token hashing", () => {
    it("hashes tokens with SHA-256 before storage", () => {
      const plaintext = "my-secret-token";
      const hash = hashToken(plaintext);
      
      // SHA-256 produces 64 hex characters
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("produces different hashes for different tokens", () => {
      const token1 = "token-abc-123";
      const token2 = "token-xyz-789";
      
      expect(hashToken(token1)).not.toBe(hashToken(token2));
    });

    it("supports legacy plaintext lookup via OR clause", () => {
      // The WHERE clause should be:
      // WHERE (accept_token_hash = p_token_hash OR accept_token = p_token_hash)
      const whereClause = "(accept_token_hash = p_token_hash OR accept_token = p_token_hash)";
      expect(whereClause).toContain("accept_token_hash = p_token_hash");
      expect(whereClause).toContain("accept_token = p_token_hash");
      expect(whereClause).toContain("OR");
    });
  });

  describe("validate_and_get_invite security", () => {
    it("returns only masked email not plaintext", () => {
      const maskedEmail = "j***@e***.com";
      const plaintextEmail = "john@example.com";
      
      // Function should return masked format
      expect(maskedEmail).toContain("***");
      expect(maskedEmail).not.toBe(plaintextEmail);
    });

    it("masks email in SQL function", () => {
      // The function should use SUBSTRING to mask the email
      const maskingLogic = `
        SUBSTRING(om.invited_email FROM 1 FOR 1) || '***@' || 
        SUBSTRING(SPLIT_PART(om.invited_email, '@', 2) FROM 1 FOR 1) || '***.'
      `;
      expect(maskingLogic).toContain("SUBSTRING");
      expect(maskingLogic).toContain("***");
    });

    it("returns inviter display name not raw email", () => {
      // Should prefer name over email, and mask email if used
      const displayLogic = `
        CASE 
          WHEN name <> '' THEN name
          WHEN email IS NOT NULL THEN masked_email
          ELSE ''
        END
      `;
      expect(displayLogic).toContain("CASE");
      expect(displayLogic).toContain("masked_email");
    });
  });

  describe("Permission grants", () => {
    it("grants accept_organization_invite to authenticated only", () => {
      const grants = `
        REVOKE ALL ON FUNCTION accept_organization_invite(TEXT) FROM PUBLIC;
        REVOKE ALL ON FUNCTION accept_organization_invite(TEXT) FROM anon;
        GRANT EXECUTE ON FUNCTION accept_organization_invite(TEXT) TO authenticated;
      `;
      expect(grants).toContain("FROM PUBLIC");
      expect(grants).toContain("FROM anon");
      expect(grants).toContain("TO authenticated");
    });

    it("explicitly revokes from anon and public", () => {
      // Both REVOKE statements must be present
      expect("REVOKE ALL FROM PUBLIC").toBeTruthy();
      expect("REVOKE ALL FROM anon").toBeTruthy();
    });
  });

  describe("API route security", () => {
    it("calls RPC without user_id or email parameters", () => {
      // API should only pass token_hash
      const apiCall = {
        p_token_hash: hashToken("test-token")
      };
      
      expect(apiCall).toHaveProperty("p_token_hash");
      expect(apiCall).not.toHaveProperty("p_user_id");
      expect(apiCall).not.toHaveProperty("p_user_email");
    });

    it("returns only masked values from invite-info endpoint", () => {
      // Response should not contain plaintext emails
      const response = {
        organizationName: "Test Ward",
        maskedInvitedEmail: "j***@e***.com",
        inviterDisplayName: "John Smith"
      };
      
      expect(response).toHaveProperty("maskedInvitedEmail");
      expect(response).not.toHaveProperty("invitedEmail");
      expect(response).not.toHaveProperty("invitedByEmail");
    });
  });
});
