import { readFileSync } from "fs";
import { join } from "path";

describe("get_dashboard_events migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261020091000_get_dashboard_events.sql"),
    "utf-8"
  );
  const body = sql.slice(sql.indexOf("AS $function$"), sql.lastIndexOf("$function$"));

  it("runs as the caller (RLS applies) with a pinned search_path", () => {
    expect(sql).toMatch(/SECURITY INVOKER/);
    expect(sql).not.toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path TO 'public'/);
  });

  it("returns NULL without a signed in user", () => {
    expect(body).toMatch(/IF v_uid IS NULL THEN\s+RETURN NULL;/);
  });

  it("returns counts, never signup rows or contact fields", () => {
    for (const col of ["member_name", "member_email", "member_phone", "cancel_token", "user_email", "leader_email"]) {
      expect(body).not.toContain(col);
    }
    expect(body).toMatch(/'total_signups', \(\s+SELECT count\(\*\)/);
  });

  it("is executable by signed in users only", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_dashboard_events\(text\) FROM PUBLIC, anon, authenticated;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_dashboard_events\(text\) TO authenticated, service_role;/);
  });
});
