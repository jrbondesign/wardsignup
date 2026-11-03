import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Static guard rails for Fix 5 (wrap auth.* calls in RLS policies as
 * (select auth.*())). Behavior before and after is checked against a real
 * local Postgres by scripts/rls-tests/run_initplan.sh.
 */
const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");
const FILE = "20261103090000_rls_initplan_wrap_auth_calls.sql";
const STORAGE_FILE = "20261103090100_rls_initplan_wrap_storage.sql";

const stripComments = (sql: string) => sql.replace(/--.*$/gm, "");
const statements = (sql: string) =>
  stripComments(sql)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
/** auth.uid()/role()/jwt()/email() calls that are not directly inside (select ...). */
const bareAuthCalls = (stmt: string) =>
  stmt.replace(/\(\s*select\s+auth\.(uid|role|jwt|email)\(\)\s*\)/gi, "").match(/auth\.(uid|role|jwt|email)\(\)/gi) ?? [];

describe("RLS initplan migration (Fix 5)", () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, FILE), "utf-8");
  const storageSql = readFileSync(join(MIGRATIONS_DIR, STORAGE_FILE), "utf-8");
  const publicStmts = statements(sql);
  const stmts = [...publicStmts, ...statements(storageSql)];
  const creates = stmts
    .filter((s) => /^CREATE POLICY/i.test(s))
    .map((s) => {
      const m = s.match(/^CREATE POLICY "([^"]+)" ON (\w+\.\w+)\s+AS (\w+) FOR (\w+) TO (\w+)/);
      if (!m) throw new Error(`unparsed policy: ${s.slice(0, 80)}`);
      return { name: m[1], table: m[2], mode: m[3], cmd: m[4], role: m[5], body: s };
    });
  const drops = stmts
    .filter((s) => /^DROP POLICY/i.test(s))
    .map((s) => s.match(/^DROP POLICY IF EXISTS "([^"]+)" ON (\w+\.\w+)$/)?.slice(1, 3).join(" @ "));

  it("rewrites exactly the 15 policies that call auth.* today, keeping name, command and roles", () => {
    expect(creates.map((c) => `${c.table} | ${c.name} | ${c.cmd}`).sort()).toEqual(
      [
        "public.campaigns | Org members insert campaigns | INSERT",
        "public.google_calendar_connections | Users can view own connections metadata | SELECT",
        "public.mcp_tokens | Users can delete their own MCP tokens | DELETE",
        "public.mcp_tokens | Users can view their own MCP tokens | SELECT",
        "public.organization_members | Members and owner read members | SELECT",
        "public.organization_members | Owner manages members | ALL",
        "public.organizations | Members and owner read organizations | SELECT",
        "public.organizations | Owner updates organization | UPDATE",
        "public.organizations | Users insert own organization | INSERT",
        "public.organizer_profiles | Users insert own organizer profile | INSERT",
        "public.organizer_profiles | Users read own organizer profile | SELECT",
        "public.organizer_profiles | Users update own organizer profile | UPDATE",
        "storage.objects | Authenticated delete own objects | DELETE",
        "storage.objects | Authenticated update own objects | UPDATE",
        "storage.objects | Authenticated upload to own folder | INSERT",
      ].sort()
    );
    for (const c of creates) {
      expect(c.mode).toBe("PERMISSIVE");
      expect(c.role).toBe("public");
    }
  });

  it("drops each policy right before recreating it, inside one transaction", () => {
    expect(drops.sort()).toEqual(creates.map((c) => `${c.name} @ ${c.table}`).sort());
    const order = stmts.filter((s) => /^(DROP|CREATE) POLICY/i.test(s));
    for (let i = 0; i < order.length; i += 2) {
      const name = order[i].match(/"([^"]+)"/)?.[1];
      expect(order[i]).toMatch(/^DROP POLICY IF EXISTS/);
      expect(order[i + 1]).toMatch(new RegExp(`^CREATE POLICY "${name}"`));
    }
    expect(publicStmts[0]).toBe("BEGIN");
    expect(publicStmts[publicStmts.length - 1]).toBe("COMMIT");
    expect(creates.filter((c) => c.table.startsWith("storage.")).every((c) => storageSql.includes(c.name))).toBe(true);
    expect(stripComments(sql)).not.toMatch(/storage\./);
  });

  it("storage part skips (no error, no change) when the migration role cannot act as the storage.objects owner", () => {
    const code = stripComments(storageSql);
    expect(code).toMatch(/^DO \$\$/m);
    expect(code).toMatch(/WHERE n\.nspname = 'storage' AND c\.relname = 'objects'/);
    expect(code).toMatch(/IF v_owner IS NULL OR NOT pg_has_role\(current_user, v_owner, 'USAGE'\) THEN[\s\S]*?RETURN;\s+END IF;/);
    // The guard comes before any policy change.
    expect(code.indexOf("RETURN;")).toBeLessThan(code.indexOf("DROP POLICY"));
  });

  it("leaves no bare auth.uid(), auth.role(), auth.jwt() or auth.email() in any policy", () => {
    for (const c of creates) expect({ policy: c.name, bare: bareAuthCalls(c.body) }).toEqual({ policy: c.name, bare: [] });
    expect(stripComments(sql).match(/\(select auth\.uid\(\)\)/g)).toHaveLength(14);
    expect(stripComments(storageSql).match(/\(select auth\.uid\(\)\)/g)).toHaveLength(3);
    expect(stripComments(storageSql).match(/\(select auth\.role\(\)\)/g)).toHaveLength(3);
  });

  it("keeps the extra guards that are not the wrap (bucket, folder, membership, WITH CHECK)", () => {
    const by = Object.fromEntries(creates.map((c) => [c.name, c.body]));
    for (const n of ["Authenticated upload to own folder", "Authenticated update own objects", "Authenticated delete own objects"]) {
      expect(by[n]).toMatch(/bucket_id = 'event-media'/);
      expect(by[n]).toMatch(/\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
    }
    expect(by["Org members insert campaigns"]).toMatch(/public\.is_org_member\(organization_id\) AND created_by = \(select auth\.uid\(\)\)/);
    expect(by["Members and owner read organizations"]).toMatch(/public\.is_org_member\(id\) OR owner_id = \(select auth\.uid\(\)\)/);
    expect(by["Owner updates organization"]).toMatch(/USING \(owner_id = \(select auth\.uid\(\)\)\)\s+WITH CHECK \(owner_id = \(select auth\.uid\(\)\)\)/);
    expect(by["Owner manages members"].match(/organizations\.owner_id = \(select auth\.uid\(\)\)/g)).toHaveLength(2);
    // Today's UPDATE policy has no WITH CHECK; adding one would be a behavior change.
    expect(by["Users update own organizer profile"]).not.toMatch(/WITH CHECK/);
  });

  it("every later migration that writes a policy keeps the wrap", () => {
    const later = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql") && f > STORAGE_FILE);
    for (const f of later) {
      for (const s of statements(readFileSync(join(MIGRATIONS_DIR, f), "utf-8"))) {
        if (/^(CREATE|ALTER) POLICY/i.test(s)) expect({ file: f, bare: bareAuthCalls(s) }).toEqual({ file: f, bare: [] });
      }
    }
  });
});
