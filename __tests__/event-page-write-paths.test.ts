/**
 * @jest-environment node
 *
 * Inventory guard, not a runtime staleness test: every source file that writes
 * a table the public event page shows (campaigns, sessions, campaign_items,
 * signups, item_signups, or the capacity signup RPCs) must expire the page
 * cache, or be listed below with the reason its write cannot change what
 * /event/[id] shows. A new write path fails this test until it is wired up or
 * explained, so the 5 minute cache never hides an organizer's change.
 *
 * The scanner skips whitespace and comments between .from(...) and the write
 * so a comment on the next line (as in the create-event route) cannot hide a
 * path. It does not prove the expire runs on the success path, and it only
 * looks at app, components, and lib.
 */
import fs from "fs";
import path from "path";

const ROOT = path.join(__dirname, "..");
const DIRS = ["app", "components", "lib"];
const TABLES = "campaigns|sessions|campaign_items|signups|item_signups";
const FROM_RE = new RegExp(String.raw`\.from\(["'](${TABLES})["']\)`, "g");
const WRITE_RE = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*\.(insert|update|delete|upsert)\(/;
const RPC_RE = /\.rpc\(["']create_(item_)?signup_if_capacity/;
const EXPIRES_RE = /revalidateEventPage\(|expirePublicEventPage\(/;

/** Files whose writes never change the public page, with why. */
const NOT_SHOWN_ON_PUBLIC_PAGE: Record<string, string> = {
  "lib/supabase.ts": "createSignupIfCapacityRpc helper; its callers (signups, bulk) expire the page",
  "lib/organizer-email.ts": "campaigns.organizer_last_instant_notify_at, internal",
  "app/api/cron/participant-reminders/route.ts": "signups.reminder_sent_at, internal",
  "app/api/cron/organizer-digest/route.ts": "campaigns.organizer_last_digest_sent_at, internal",
  "app/api/events/route.ts": "creates a brand new event id; nothing is cached for it yet",
  "app/api/events/[id]/duplicate/route.ts": "creates a brand new event id; nothing is cached for it yet",
};

function hasTableWrite(src: string): boolean {
  if (RPC_RE.test(src)) return true;
  FROM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FROM_RE.exec(src))) {
    if (WRITE_RE.test(src.slice(m.index + m[0].length))) return true;
  }
  return false;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const writers = DIRS.flatMap((d) => sourceFiles(path.join(ROOT, d)))
  .map((f) => ({ rel: path.relative(ROOT, f).split(path.sep).join("/"), src: fs.readFileSync(f, "utf8") }))
  .filter(({ src }) => hasTableWrite(src));

describe("public event page write paths", () => {
  it("finds the known write paths (sanity check on the scan)", () => {
    const rels = writers.map((w) => w.rel);
    for (const known of [
      "app/api/signups/route.ts",
      "app/api/signups/cancel/route.ts",
      "app/api/sessions/[id]/route.ts",
      "app/api/events/route.ts",
      "app/api/events/[id]/route.ts",
      "app/api/events/[id]/cover/route.ts",
      "app/api/upload/route.ts",
      "components/edit/hooks/useSaveEditEvent.ts",
    ]) {
      expect(rels).toContain(known);
    }
  });

  it.each(writers.map((w) => [w.rel, w.src] as const))("%s expires the event page or is explained", (rel, src) => {
    if (NOT_SHOWN_ON_PUBLIC_PAGE[rel]) return;
    expect(EXPIRES_RE.test(src)).toBe(true);
  });

  it("has no stale allowlist entries", () => {
    const rels = new Set(writers.map((w) => w.rel));
    for (const rel of Object.keys(NOT_SHOWN_ON_PUBLIC_PAGE)) expect(rels.has(rel)).toBe(true);
  });
});
