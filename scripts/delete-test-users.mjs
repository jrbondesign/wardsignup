/**
 * Deletes allowlisted test users (same allowlist as POST /api/admin-utils/delete-test-users).
 * Usage: node --env-file=.env.local scripts/delete-test-users.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. node --env-file=.env.local)");
  process.exit(1);
}

const raw =
  process.env.DELETABLE_TEST_USER_EMAILS?.trim() ||
  "bondesign+jasper@gmail.com,jon+test@jrbond.com";
const emails = raw
  .split(/[,;]+/)
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const admin = createClient(url, key);

async function findUserIdByEmail(emailLower) {
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data.users ?? [];
    const u = batch.find((x) => x.email?.toLowerCase() === emailLower);
    if (u) return u.id;
    if (batch.length < perPage) break;
    page += 1;
    if (page > 100) break;
  }
  return null;
}

async function main() {
  console.log("Deleting:", emails.join(", "));
  for (const email of emails) {
    const id = await findUserIdByEmail(email);
    if (!id) {
      console.log(`  [skip] not found: ${email}`);
      continue;
    }
    await admin.from("welcome_email_sent").delete().eq("user_id", id);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error(`  [error] ${email}:`, error.message);
    else console.log(`  [ok] deleted ${email} (${id})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
