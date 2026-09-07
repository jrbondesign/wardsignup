/**
 * READ-ONLY preview of what the daily organizer-digest cron would send on its
 * next run for a brand. No inserts, no emails. Mirrors runFeedbackAskPass
 * candidate selection + the digest/metrics queues.
 *
 * Run: npx tsx --env-file=.env.local scripts/feedback-queue-preview.ts
 */
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { parseMetricsAdminEmails } from "@/lib/metrics-admin";

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID?.trim() || "wardsignup";
const creatorNotifyTo = process.env.CREATOR_NOTIFY_TO || "jon@jrbond.com";

function askDelayDays(): number {
  const n = Number(process.env.FEEDBACK_ASK_DELAY_DAYS);
  return Number.isFinite(n) && n >= 0 ? n : 4;
}
function skipEmails(): Set<string> {
  const set = new Set<string>(parseMetricsAdminEmails());
  set.add(creatorNotifyTo.trim().toLowerCase());
  for (const p of (process.env.CREATOR_NOTIFY_SKIP_EMAILS || "").split(",")) {
    const e = p.trim().toLowerCase();
    if (e) set.add(e);
  }
  return set;
}

async function main() {
  const admin = createServiceRoleClient();
  const cutoff = new Date(Date.now() - askDelayDays() * 864e5).toISOString();
  console.log(`Brand: ${BRAND_ID}  |  ask delay: ${askDelayDays()}d  |  cutoff: ${cutoff}`);
  console.log(`Skip-list (this env): ${[...skipEmails()].join(", ") || "(none)"}\n`);

  // Already-asked user_ids for this brand.
  const { data: existing } = await admin
    .from("feedback_requests")
    .select("user_id, email_lower, status")
    .eq("brand_id", BRAND_ID);
  const asked = new Set((existing ?? []).map((r: any) => r.user_id));

  // Engaged creators: campaign w/ >=1 signup, created >= delay days ago.
  const { data: campaigns } = await admin
    .from("campaigns")
    .select("id, created_by, user_email, created_at, signups!inner(id)")
    .eq("brand_id", BRAND_ID)
    .not("created_by", "is", null)
    .lte("created_at", cutoff)
    .limit(500);

  const byCreator = new Map<string, any>();
  for (const c of (campaigns ?? []) as any[]) {
    if (!byCreator.has(c.created_by)) byCreator.set(c.created_by, c);
  }

  const skip = skipEmails();
  const queue: string[] = [];
  const skipped: string[] = [];
  for (const [userId, c] of byCreator) {
    if (asked.has(userId)) continue; // already has a row → never re-asked
    const { data: u } = await admin.auth.admin.getUserById(userId);
    const email = (u?.user?.email || c.user_email || "").trim().toLowerCase();
    if (!email) continue;
    if (skip.has(email)) { skipped.push(email); continue; }
    queue.push(email);
  }

  console.log("=== FEEDBACK ASK — would email on next run (bounded 20/run) ===");
  console.log(`engaged creators: ${byCreator.size}  |  already asked: ${asked.size}`);
  queue.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  console.log(`  → ${queue.length} pending${queue.length > 20 ? " (20 this run, rest next day)" : ""}`);
  if (skipped.length) console.log(`  (skipped by skip-list: ${skipped.join(", ")})`);

  const responded = (existing ?? []).filter((r: any) => r.status === "responded");
  console.log(`\n=== FEEDBACK DIGEST (Mondays UTC) → ${creatorNotifyTo} ===`);
  console.log(`  responded & not triaged: ${responded.length}`);
  responded.forEach((r: any, i: number) => console.log(`  ${i + 1}. ${r.email_lower}`));

  // Organizer metrics digest queue (same cron).
  const { data: digestCamps } = await admin
    .from("campaigns")
    .select("id, organizer_last_digest_sent_at")
    .eq("brand_id", BRAND_ID)
    .eq("organizer_digest_enabled", true);
  console.log(`\n=== ORGANIZER METRICS DIGEST (opted-in campaigns) ===`);
  console.log(`  campaigns with digest enabled: ${(digestCamps ?? []).length} (each sends if new signups/activity since last)`);
}

main().catch((e) => { console.error("❌", e.message || e); process.exit(1); });
