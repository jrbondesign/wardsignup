import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * True when the event had new activity (signups or slot changes) since the
 * last digest, or in the last 24 hours when no digest has gone out yet.
 * Organizers with nothing new get no email.
 */
export async function campaignNeedsDigest(
  admin: SupabaseClient,
  campaign: {
    id: string;
    organizer_last_digest_sent_at: string | null;
  },
  now: Date = new Date(),
): Promise<boolean> {
  const since =
    campaign.organizer_last_digest_sent_at ??
    new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const id = campaign.id;

  const { count: newSignups } = await admin
    .from("signups")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id)
    .gt("signed_up_at", since);

  if ((newSignups ?? 0) > 0) return true;

  const { count: newItemSignups } = await admin
    .from("item_signups")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id)
    .gt("signed_up_at", since);

  if ((newItemSignups ?? 0) > 0) return true;

  const { data: touched } = await admin
    .from("sessions")
    .select("id")
    .eq("campaign_id", id)
    .gt("updated_at", since)
    .limit(1);

  return (touched?.length ?? 0) > 0;
}

/** Leader gets the digest when per signup emails are off and they are not the organizer. */
export function leaderDigestRecipient(
  c: { leader_email?: string | null; leader_signup_email_enabled?: boolean | null },
  organizerEmail: string | null | undefined,
): string | null {
  const leader = (c.leader_email ?? "").trim().toLowerCase();
  if (!leader || c.leader_signup_email_enabled) return null;
  if (leader === (organizerEmail ?? "").trim().toLowerCase()) return null;
  return leader;
}

