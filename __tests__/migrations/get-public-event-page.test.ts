import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guard rails for the one round trip public event page RPC. It must stay a
 * read of already public sources and never touch the PII tables directly.
 */
describe("get_public_event_page migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261020090000_get_public_event_page.sql"),
    "utf-8"
  );
  const body = sql.slice(sql.indexOf("AS $function$"), sql.lastIndexOf("$function$"));

  it("is SECURITY INVOKER with a pinned search_path", () => {
    expect(sql).toMatch(/SECURITY INVOKER/);
    expect(sql).not.toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path TO 'public'/);
    expect(sql).toMatch(/\bSTABLE\b/);
  });

  it("reads signups only through the public views", () => {
    expect(body).toMatch(/public\.signups_public/);
    expect(body).toMatch(/public\.item_signups_public/);
    expect(body).not.toMatch(/public\.signups\b(?!_public)/);
    expect(body).not.toMatch(/public\.item_signups\b(?!_public)/);
    expect(body).not.toMatch(/public\.campaigns\b/);
  });

  it("takes the event from get_public_campaign", () => {
    expect(body).toMatch(/public\.get_public_campaign\(get_public_event_page\.campaign_id\)/);
  });

  it("never selects contact or token columns", () => {
    for (const col of ["member_email", "member_phone", "cancel_token", "user_email", "leader_email", "organization_id"]) {
      expect(body).not.toContain(col);
    }
  });

  it("revokes default EXECUTE and grants only anon, authenticated and service_role", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_public_event_page\(uuid\) FROM PUBLIC, anon, authenticated;/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_public_event_page\(uuid\) TO anon, authenticated, service_role;/
    );
  });
});
