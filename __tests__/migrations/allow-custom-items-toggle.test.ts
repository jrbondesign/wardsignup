import { readFileSync } from "fs";
import { join } from "path";

/** Guard rails for the write-in switch migration (proof: scripts/allow-custom-items-pg-proof.sql). */
describe("allow_custom_items migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261111210000_allow_custom_items_toggle.sql"),
    "utf-8",
  );

  it("adds the column defaulting to on so existing events are unchanged", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS allow_custom_items boolean NOT NULL DEFAULT true/);
  });

  it("refuses write-ins in the item signup RPC when off", () => {
    expect(sql).toMatch(/IF label IS NOT NULL AND custom_allowed IS FALSE THEN\s+RAISE EXCEPTION 'CUSTOM_ITEMS_DISABLED'/);
  });

  it("keeps the RPC service_role only", () => {
    expect(sql).toMatch(/FROM anon, authenticated;/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.create_item_signup_if_capacity\([^)]*\)\s+TO [^;]*anon/);
  });

  it("does not reopen a public insert path", () => {
    expect(sql).not.toMatch(/GRANT INSERT/i);
    // The legacy policy is only replaced inside a pg_policies existence check.
    expect(sql).toMatch(/IF EXISTS \(\s*SELECT 1 FROM pg_policies[\s\S]*policyname = 'Public insert custom item_signups'/);
    expect(sql).toMatch(/AND c\.allow_custom_items/);
  });

  it("exposes the flag on the public event row", () => {
    expect(sql).toMatch(/event_dates jsonb,\s+allow_custom_items boolean\s+\)/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_public_campaign\(uuid\) TO anon, authenticated, service_role;/);
  });
});
