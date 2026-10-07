import type { User } from "@supabase/supabase-js";
import { creatorNotifyEmailFrom, type PublicBrand } from "@/lib/brand";
import { escapeHtml } from "@/lib/html-escape";
import { getResendForBrand } from "@/lib/resend-for-brand";
import { createServiceRoleClient } from "@/lib/supabase-admin";

/** Every founder-facing message (new creator, feedback digest) goes here. */
export const FOUNDER_NOTIFY_TO = "jonathan@wardsignup.com";

/** Founder/internal/test inboxes that never count as a new creator. */
export function founderNotifySkipEmails(): Set<string> {
  const set = new Set<string>([FOUNDER_NOTIFY_TO, "jon@jrbond.com", "bondesign@gmail.com"]);
  const raw = process.env.CREATOR_NOTIFY_SKIP_EMAILS?.trim();
  if (raw) {
    for (const part of raw.split(",")) {
      const e = part.trim().toLowerCase();
      if (e) set.add(e);
    }
  }
  return set;
}

/**
 * A creator is an organization owner who has created their first event (members can
 * now sign up). Called after an event is created; notifies the founder once per user.
 * Best-effort: never throws.
 */
export async function notifyFounderIfFirstEvent(opts: {
  user: Pick<User, "id" | "email" | "user_metadata">;
  orgId: string;
  orgName: string;
  eventId: string;
  eventName: string;
  brand: PublicBrand;
}): Promise<void> {
  const { user, orgId, orgName, eventId, eventName, brand } = opts;
  try {
    const email = user.email?.trim().toLowerCase();
    if (!email || founderNotifySkipEmails().has(email)) return;

    const admin = createServiceRoleClient();
    const { data: org } = await admin
      .from("organizations")
      .select("owner_id")
      .eq("id", orgId)
      .maybeSingle();
    if ((org as { owner_id?: string } | null)?.owner_id !== user.id) return;

    const { count } = await admin
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("created_by", user.id);
    if ((count ?? 0) !== 1) return;

    // Dedupe via the existing notification log, keyed per user (not per email, which
    // already holds every sign-in from the old definition).
    const { data: first } = await admin.rpc("try_insert_creator_signup_notification", {
      p_email: `activated:${user.id}`,
    } as never);
    if (first !== true) return;

    const resend = getResendForBrand(brand);
    if (!resend) return;
    const name = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? "(none)");
    const { error } = await resend.emails.send({
      from: creatorNotifyEmailFrom(brand),
      to: FOUNDER_NOTIFY_TO,
      subject: `New ${brand.name} creator`,
      html: `
          <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; max-width: 640px; margin: 0 auto; padding: 24px; color: #111827;">
            <h2 style="margin: 0 0 12px; font-size: 18px;">New creator published their first event</h2>
            <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6;"><strong>Email:</strong> ${escapeHtml(email)}</p>
            <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6;"><strong>Name:</strong> ${escapeHtml(name)}</p>
            <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6;"><strong>Organization:</strong> ${escapeHtml(orgName)}</p>
            <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6;"><strong>Event:</strong> ${escapeHtml(eventName)}</p>
            <p style="margin: 0; font-size: 12px; color: #6b7280;">User ID: ${escapeHtml(user.id)} · Event ID: ${escapeHtml(eventId)}</p>
          </div>
        `,
    });
    if (error) console.error("Founder notify Resend error:", error);
  } catch (e) {
    console.error("Founder notify error:", e);
  }
}
