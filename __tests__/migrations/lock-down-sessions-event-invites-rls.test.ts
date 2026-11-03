import { readFileSync } from "fs";
import { join } from "path";

/**
 * Static guard rails for the sessions / event_invites lockdown. The behavior
 * (anon, organizer, non-member) is checked against a real local Postgres by
 * scripts/rls-tests/rls_lockdown_sessions_event_invites.sql.
 */
describe("lock down sessions and event_invites RLS migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261101140000_lock_down_sessions_event_invites_rls.sql"),
    "utf-8"
  );
  const code = sql.replace(/--.*$/gm, "");
  const policies = [...code.matchAll(/CREATE POLICY "([^"]+)" ON public\.(\w+)\s+FOR (\w+) TO ([\w, ]+)/g)].map((m) => ({
    name: m[1],
    table: m[2],
    cmd: m[3],
    roles: m[4].split(",").map((r) => r.trim()),
  }));

  it("drops both allow-all policies", () => {
    expect(code).toMatch(/DROP POLICY IF EXISTS "Enable all for sessions" ON public\.sessions;/);
    expect(code).toMatch(/DROP POLICY IF EXISTS "Enable all for event_invites" ON public\.event_invites;/);
    expect(policies.map((p) => p.name)).not.toContain("Enable all for sessions");
  });

  it("only SELECT on sessions is open to anon; every write is authenticated org members", () => {
    for (const p of policies) {
      if (p.table === "sessions" && p.cmd === "SELECT") {
        expect(p.roles.sort()).toEqual(["anon", "authenticated"]);
        continue;
      }
      expect(p.roles).toEqual(["authenticated"]);
      expect(p.cmd).not.toBe("ALL");
    }
    expect(policies.filter((p) => p.table === "sessions")).toHaveLength(4);
    expect(policies.filter((p) => p.table === "event_invites")).toHaveLength(4);
    expect(code).not.toMatch(/USING \(true\)[\s\S]{0,40}WITH CHECK \(true\)/);
  });

  it("checks membership with is_org_member on every write and on invite reads", () => {
    const blocks = code.split("CREATE POLICY").slice(1);
    for (const b of blocks) {
      if (/^ "Anyone can read sessions"/.test(b)) continue;
      expect(b).toMatch(/public\.is_org_member\(c\.organization_id\)/);
    }
  });

  it("revokes anon writes and TRUNCATE, keeps service_role untouched", () => {
    expect(code).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public\.sessions FROM anon;/);
    expect(code).toMatch(/REVOKE ALL ON public\.event_invites FROM anon;/);
    expect(code).toMatch(/REVOKE TRUNCATE, TRIGGER, REFERENCES ON public\.sessions FROM authenticated;/);
    expect(code).not.toMatch(/service_role/);
  });
});
