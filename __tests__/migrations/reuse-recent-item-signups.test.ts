import { readFileSync } from "fs";
import { join } from "path";

describe("reuse recent item signups migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261112170000_reuse_recent_item_signups.sql"),
    "utf8",
  );

  it("replaces create_item_signup_if_capacity and keeps it service-role only", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.create_item_signup_if_capacity\(/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_item_signup_if_capacity\(/);
    expect(sql).toMatch(/TO service_role/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.create_item_signup_if_capacity\([\s\S]*FROM anon, authenticated/);
  });

  it("reuses a recent same-person row before inserting", () => {
    expect(sql).toMatch(/signed_up_at >= now\(\) - interval '30 minutes'/);
    expect(sql).toMatch(/lower\(trim\(s\.member_email\)\) = lower\(req_email\)/);
    expect(sql).toMatch(/lower\(trim\(s\.member_name\)\) = lower\(trim\(p_member_name\)\)/);
    expect(sql).toMatch(/s\.quantity = qty/);
    expect(sql).toMatch(/IF FOUND THEN\s+RETURN new_row;/);
    expect(sql).toMatch(/INSERT INTO public\.item_signups/);
  });
});
