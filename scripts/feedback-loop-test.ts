/**
 * One-off REAL end-to-end test of the creator feedback ask email.
 * Mirrors runFeedbackAskPass: creates a real (throwaway) user + token row,
 * then sends the actual ask email via the repo's own send path.
 *
 * Run: npx tsx --env-file=.env.local scripts/feedback-loop-test.ts
 */
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { publicSiteOriginAndBrandForCampaign } from "@/lib/brand/campaign-site";
import { sendFeedbackAskEmail } from "@/lib/feedback-email";

const TO = "jrbond@me.com";
const BRAND_ID = "wardsignup";
const TEST_LOGIN = "wardsignup-feedback-loop-test@jrbond.com";

async function main() {
  const admin = createServiceRoleClient();

  // 1. Throwaway auth user to satisfy the FK without touching a real creator.
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: TEST_LOGIN,
    email_confirm: true,
    user_metadata: { full_name: "Jon (feedback test)" },
  });
  if (cErr || !created?.user) throw new Error(`createUser: ${cErr?.message}`);
  const userId = created.user.id;
  console.log("created test user:", userId);

  // 2. Real token row, exactly as the cron would insert it.
  const { data: rows, error: iErr } = await admin
    .from("feedback_requests")
    .insert({ user_id: userId, brand_id: BRAND_ID, email_lower: TO } as never)
    .select("id, token");
  if (iErr || !rows?.[0]) throw new Error(`insert row: ${iErr?.message}`);
  const { id, token } = rows[0] as { id: string; token: string };
  console.log("feedback_requests row:", id, "token:", token);

  // 3. Send the actual ask email via the real path.
  const { siteOrigin, brand } = publicSiteOriginAndBrandForCampaign({
    brand_id: BRAND_ID,
  });
  const formUrl = `${siteOrigin}/feedback/${token}`;
  console.log("form URL:", formUrl);

  const result = await sendFeedbackAskEmail({
    brand,
    to: TO,
    firstName: "Jon",
    formUrl,
  });
  if (!result.ok) throw new Error(`send failed: ${result.error}`);

  await admin
    .from("feedback_requests")
    .update({ sent_at: new Date().toISOString(), status: "sent" } as never)
    .eq("id", id);

  console.log("\n✅ SENT to", TO);
  console.log("   Click the form URL above; your answers write back to row", id);
  console.log("   Cleanup later: delete auth user", userId, "(cascades the row)");
}

main().catch((e) => {
  console.error("❌", e.message || e);
  process.exit(1);
});
