/**
 * Test for ambiguous column reference fix in invite acceptance functions
 * 
 * Bug: accept_organization_invite RETURNS TABLE with organization_id as OUT parameter,
 * creating ambiguity with unqualified organization_id column references.
 * ERROR 42702: column reference "organization_id" is ambiguous
 * 
 * This happened in the "already a member" query:
 * WHERE organization_id = v_invite.organization_id
 * 
 * PostgreSQL couldn't tell if organization_id meant:
 * - public.organization_members.organization_id (the column)
 * - organization_id (the OUT parameter from RETURNS TABLE)
 */

import { readFileSync } from "fs";
import { join } from "path";

describe("Invite accept ambiguous column fix migration", () => {
  const migrationPath = join(
    process.cwd(),
    "supabase/migrations/20261017140000_fix_invite_accept_ambiguous_columns.sql"
  );

  let migrationSql: string;

  beforeAll(() => {
    migrationSql = readFileSync(migrationPath, "utf-8");
  });

  it("migration file exists", () => {
    expect(migrationSql).toBeTruthy();
    expect(migrationSql.length).toBeGreaterThan(100);
  });

  it("includes #variable_conflict use_column directive", () => {
    // This directive tells PostgreSQL to prefer column names over variable names
    // when there's ambiguity
    expect(migrationSql).toContain("#variable_conflict use_column");
    
    // Should appear in both functions
    const directiveCount = (migrationSql.match(/#variable_conflict use_column/g) || []).length;
    expect(directiveCount).toBeGreaterThanOrEqual(2);
  });

  describe("validate_and_get_invite", () => {
    it("recreates the function with SECURITY DEFINER", () => {
      expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.validate_and_get_invite");
      expect(migrationSql).toContain("SECURITY DEFINER");
      expect(migrationSql).toContain("SET search_path = public");
    });

    it("returns the same columns (masked_invited_email, organization_name, inviter_display_name)", () => {
      expect(migrationSql).toMatch(/RETURNS TABLE \([^)]*masked_invited_email TEXT/);
      expect(migrationSql).toMatch(/RETURNS TABLE \([^)]*organization_name TEXT/);
      expect(migrationSql).toMatch(/RETURNS TABLE \([^)]*inviter_display_name TEXT/);
    });

    it("fully qualifies column references with table aliases", () => {
      // om.accept_token_hash, om.status, om.invited_email, etc.
      expect(migrationSql).toContain("om.accept_token_hash");
      expect(migrationSql).toContain("om.status");
      expect(migrationSql).toContain("om.invited_email");
      expect(migrationSql).toContain("o.id = om.organization_id");
      expect(migrationSql).toContain("u.id = om.invited_by");
    });

    it("re-asserts grants (authenticated and anon can execute)", () => {
      const validateGrantSection = migrationSql.substring(
        migrationSql.indexOf("CREATE OR REPLACE FUNCTION public.validate_and_get_invite"),
        migrationSql.indexOf("CREATE OR REPLACE FUNCTION public.accept_organization_invite")
      );
      
      expect(validateGrantSection).toContain("REVOKE ALL ON FUNCTION public.validate_and_get_invite(TEXT) FROM PUBLIC");
      expect(validateGrantSection).toContain("REVOKE ALL ON FUNCTION public.validate_and_get_invite(TEXT) FROM anon");
      expect(validateGrantSection).toContain("GRANT EXECUTE ON FUNCTION public.validate_and_get_invite(TEXT) TO authenticated, anon");
    });
  });

  describe("accept_organization_invite", () => {
    it("recreates the function with SECURITY DEFINER", () => {
      expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.accept_organization_invite");
      const acceptSection = migrationSql.substring(
        migrationSql.indexOf("CREATE OR REPLACE FUNCTION public.accept_organization_invite")
      );
      expect(acceptSection).toContain("SECURITY DEFINER");
      expect(acceptSection).toContain("SET search_path = public");
    });

    it("returns the same columns (organization_id, organization_name, ownership_transferred, already_member)", () => {
      expect(migrationSql).toMatch(/accept_organization_invite[^{]*RETURNS TABLE \([^)]*organization_id UUID/);
      expect(migrationSql).toMatch(/accept_organization_invite[^{]*RETURNS TABLE \([^)]*organization_name TEXT/);
      expect(migrationSql).toMatch(/accept_organization_invite[^{]*RETURNS TABLE \([^)]*ownership_transferred BOOLEAN/);
      expect(migrationSql).toMatch(/accept_organization_invite[^{]*RETURNS TABLE \([^)]*already_member BOOLEAN/);
    });

    it("fully qualifies the critical 'already a member' query", () => {
      // This is the query that caused ERROR 42702
      // Before: WHERE organization_id = v_invite.organization_id
      // After:  WHERE om.organization_id = v_invite.organization_id
      
      const acceptSection = migrationSql.substring(
        migrationSql.indexOf("-- Check if already a member")
      );
      
      expect(acceptSection).toContain("FROM public.organization_members om");
      expect(acceptSection).toContain("WHERE om.organization_id = v_invite.organization_id");
      expect(acceptSection).toContain("AND om.user_id = v_uid");
      expect(acceptSection).toContain("AND om.status = 'accepted'");
      expect(acceptSection).toContain("AND om.id <> v_invite.id");
    });

    it("fully qualifies all UPDATE statements with table aliases", () => {
      // All UPDATEs should use: UPDATE public.organization_members om SET ...
      const updateMatches = migrationSql.match(/UPDATE public\.organization_members om/g);
      expect(updateMatches).not.toBeNull();
      expect(updateMatches!.length).toBeGreaterThanOrEqual(3); // At least 3 UPDATEs in the function
      
      // Check WHERE clauses use om.id
      expect(migrationSql).toContain("WHERE om.id = v_invite.id");
      expect(migrationSql).toContain("WHERE om.id = v_old_owner_member_id");
    });

    it("fully qualifies ownership transfer queries", () => {
      const transferSection = migrationSql.substring(
        migrationSql.indexOf("-- Handle ownership transfer")
      );
      
      // SELECT o.owner_id ... FROM organizations o WHERE o.id = ...
      expect(transferSection).toContain("SELECT o.owner_id");
      expect(transferSection).toContain("FROM public.organizations o");
      expect(transferSection).toContain("WHERE o.id = v_invite.organization_id");
      
      // SELECT om.id ... FROM organization_members om WHERE om.organization_id = ...
      expect(transferSection).toContain("SELECT om.id INTO v_old_owner_member_id");
      expect(transferSection).toContain("WHERE om.organization_id = v_invite.organization_id");
      expect(transferSection).toContain("AND om.user_id = v_current_owner");
      expect(transferSection).toContain("AND om.role = 'owner'");
      
      // UPDATE organizations o SET owner_id = ... WHERE o.id = ...
      expect(transferSection).toContain("UPDATE public.organizations o");
      expect(transferSection).toContain("SET owner_id = v_uid");
    });

    it("fully qualifies SELECT for email from auth.users", () => {
      expect(migrationSql).toContain("SELECT u.email, u.email_confirmed_at");
      expect(migrationSql).toContain("FROM auth.users u");
      expect(migrationSql).toContain("WHERE u.id = v_uid");
    });

    it("re-asserts grants (authenticated only, NOT anon)", () => {
      const acceptGrantSection = migrationSql.substring(
        migrationSql.lastIndexOf("REVOKE ALL ON FUNCTION public.accept_organization_invite")
      );
      
      // Check for revocations (PUBLIC might be case-insensitive)
      const hasPublicRevoke = acceptGrantSection.toUpperCase().includes("FROM PUBLIC") || 
                              acceptGrantSection.includes("FROM anon");
      expect(hasPublicRevoke).toBe(true);
      expect(acceptGrantSection).toContain("REVOKE ALL ON FUNCTION public.accept_organization_invite(TEXT) FROM anon");
      expect(acceptGrantSection).toContain("GRANT EXECUTE ON FUNCTION public.accept_organization_invite(TEXT) TO authenticated");
      
      // Should NOT grant to anon
      expect(acceptGrantSection).not.toMatch(/GRANT.*accept_organization_invite.*anon/);
    });
  });

  describe("Static analysis for common ambiguity patterns", () => {
    it("has no unqualified organization_id in WHERE clauses", () => {
      // Find all WHERE clauses and check they don't have bare "organization_id"
      const whereMatches = migrationSql.match(/WHERE\s+organization_id\s*=/g);
      expect(whereMatches).toBeNull(); // Should be null (no matches)
      
      // All should be qualified: om.organization_id, o.organization_id, etc.
      expect(migrationSql).toContain("om.organization_id");
    });

    it("has no unqualified user_id in WHERE clauses", () => {
      const whereMatches = migrationSql.match(/WHERE\s+user_id\s*=/g);
      expect(whereMatches).toBeNull();
      
      expect(migrationSql).toContain("om.user_id");
    });

    it("has no unqualified status in WHERE clauses", () => {
      const whereMatches = migrationSql.match(/WHERE\s+status\s*=/g);
      expect(whereMatches).toBeNull();
      
      expect(migrationSql).toContain("om.status");
    });

    it("has no unqualified id in WHERE clauses (except qualified v_invite.id)", () => {
      // Should not have "WHERE id =" but should have "WHERE om.id =" or "WHERE o.id ="
      const bareIdMatches = migrationSql.match(/WHERE\s+id\s*=/g);
      expect(bareIdMatches).toBeNull();
      
      expect(migrationSql).toContain("WHERE om.id");
      expect(migrationSql).toContain("WHERE o.id");
    });
  });
});

describe("Accept API error logging", () => {
  it("logs full RPC error details including code 42702", () => {
    // The accept route should log code, message, details, and hint
    // And specifically check for 42702 (ambiguous column)
    const acceptRoute = readFileSync(
      join(process.cwd(), "app/api/organizations/accept/route.ts"),
      "utf-8"
    );
    
    expect(acceptRoute).toContain("Accept invite RPC error");
    expect(acceptRoute).toContain("code: acceptErr.code");
    expect(acceptRoute).toContain("message: acceptErr.message");
    expect(acceptRoute).toContain("details: acceptErr.details");
    expect(acceptRoute).toContain("hint: acceptErr.hint");
    
    // Should check for 42702 specifically
    expect(acceptRoute).toContain('acceptErr.code === "42702"');
    expect(acceptRoute).toContain("Ambiguous column error");
  });
});
