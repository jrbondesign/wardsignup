import { NextRequest, NextResponse } from "next/server";
import {
  getBrandFromHost,
  inviteEmailFrom,
  publicSiteOriginAndBrandForCampaign,
} from "@/lib/brand";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAdminCampaign } from "@/lib/campaign-access";
import { escapeHtml } from "@/lib/html-escape";
import { isAppEmailInvitesEnabled } from "@/lib/limits";
import type { Campaign, Database } from "@/lib/types";
import { hasResendConfiguredForBrand } from "@/lib/resend-for-brand";
import { consumeEmailKeyRate, sendGuardedEmail } from "@/lib/email-send";
import { consumeActionRate } from "@/lib/rate-limit";
import { getPostHogClient } from "@/lib/posthog-server";

type EventInviteInsert = Database["public"]["Tables"]["event_invites"]["Insert"];

export async function POST(request: NextRequest) {
  try {
    const host =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const hostBrand = getBrandFromHost(host);

    if (!isAppEmailInvitesEnabled()) {
      return NextResponse.json(
        { error: "Sending invitations from the app is disabled during beta. Share your event link instead." },
        { status: 403 }
      );
    }
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    const body = await request.json();
    const { event_id, invitee_email, invitee_name, message } = body;

    if (!event_id || !invitee_email) {
      return NextResponse.json(
        { error: "Event ID and invitee email are required" },
        { status: 400 }
      );
    }
    if (
      typeof invitee_email !== "string" ||
      invitee_email.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitee_email.trim())
    ) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }
    if (typeof message === "string" && message.length > 1000) {
      return NextResponse.json(
        { error: "Message is too long (1000 characters max)" },
        { status: 400 },
      );
    }
    const inviteeEmailLower = invitee_email.trim().toLowerCase();

    // Per-IP and per-sender hourly limits — this endpoint emails arbitrary
    // addresses, so it must never be unbounded.
    const ipRate = await consumeActionRate("invite_send", request, 30);
    if (!ipRate.allowed) {
      return NextResponse.json(
        { error: "Too many invites. Please try again later." },
        { status: 429 },
      );
    }

    // Verify user owns this event
    const { data: event, error: eventError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", event_id)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const eventRow = event as Campaign;

    if (eventRow.brand_id && eventRow.brand_id !== hostBrand.id) {
      return NextResponse.json(
        {
          error:
            "Open this site on the same domain as the event to send invites (or use the share link instead).",
        },
        { status: 403 },
      );
    }

    if (!(await userCanAdminCampaign(supabase, user, eventRow))) {
      return NextResponse.json(
        { error: "You do not have permission to invite to this event" },
        { status: 403 }
      );
    }

    const { siteOrigin, brand: campaignBrand } = publicSiteOriginAndBrandForCampaign(
      eventRow as { brand_id?: string | null; public_host?: string | null },
    );
    if (!hasResendConfiguredForBrand(campaignBrand)) {
      return NextResponse.json(
        { error: "Email is not configured for this site." },
        { status: 503 },
      );
    }

    // Per-sender cap (20 invites/hour across all their events) and dedupe:
    // the same address can be invited to the same event at most once per day.
    const senderUnderCap = await consumeEmailKeyRate(
      "invite_sender",
      `invite-sender:${user.id}`,
      20,
    );
    if (!senderUnderCap) {
      return NextResponse.json(
        { error: "Invite limit reached for this hour. Please try again later." },
        { status: 429 },
      );
    }
    const { data: recentDup } = await supabase
      .from("event_invites")
      .select("id")
      .eq("campaign_id", event_id)
      .eq("invitee_email", inviteeEmailLower)
      .gte("sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1);
    if (recentDup?.length) {
      return NextResponse.json(
        { error: "This person was already invited to this event in the last 24 hours." },
        { status: 409 },
      );
    }

    const inviteRow: EventInviteInsert = {
      campaign_id: event_id,
      inviter_id: user.id,
      invitee_email: inviteeEmailLower,
      invitee_name: invitee_name || null,
      message: message || null,
      sent_at: new Date().toISOString(),
    };

    // Store invite record
    const { data: invite, error: insertError } = await supabase
      .from("event_invites")
      .insert(inviteRow as never)
      .select()
      .single();

    if (insertError) {
      console.error("Error creating invite:", insertError);
      return NextResponse.json(
        { error: "Failed to create invite" },
        { status: 500 }
      );
    }

    // Send email invitation (links + from-address match stored campaign brand/host)
    {
      const eventUrl = `${siteOrigin}/event/${event_id}`;
      const evName = escapeHtml(eventRow.name);
      const invName =
        typeof invitee_name === "string" && invitee_name.trim()
          ? escapeHtml(invitee_name.trim())
          : "";
      const msgEsc =
        typeof message === "string" && message.trim()
          ? escapeHtml(message.trim())
          : "";

      const send = await sendGuardedEmail({
        brand: campaignBrand,
        category: "notification",
        from: inviteEmailFrom(campaignBrand),
        to: inviteeEmailLower,
        subject: `You're invited to teach: ${eventRow.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">You've been invited to sign up as a teacher</h2>

            <p>Hi${invName ? ` ${invName}` : ""},</p>

            <p>${escapeHtml(user.email ?? "")} has invited you to sign up for teaching sessions:</p>

            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #1f2937;">${evName}</h3>
              ${msgEsc ? `<p style="color: #4b5563; font-style: italic;">"${msgEsc}"</p>` : ""}
            </div>

            <p>Click the button below to view available teaching sessions and sign up:</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${eventUrl}"
                 style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
                View Teaching Sessions
              </a>
            </div>

            <p style="color: #6b7280; font-size: 14px;">
              Or copy this link: <a href="${eventUrl}" style="color: #2563eb;">${eventUrl}</a>
            </p>

            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

            <p style="color: #9ca3af; font-size: 12px;">
              This invitation was sent via ${escapeHtml(campaignBrand.name)}. If you weren't expecting this email, you can safely ignore it.
            </p>
          </div>
        `,
      });
      if (!send.ok) {
        // Be honest: a failed send is a failed invite. The stored row records
        // the attempt; the 502 stops client retry loops from re-sending.
        console.error("Invite email send failed:", send.error || send.skipped);
        return NextResponse.json(
          { error: "The invite could not be emailed. Please try again later." },
          { status: 502 },
        );
      }
    }

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: "invite_sent",
      properties: {
        event_id,
        has_custom_message: Boolean(message),
      },
    });

    return NextResponse.json(
      {
        success: true,
        invite,
        message: "Invite sent successfully",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in POST /api/invites:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    const { searchParams } = new URL(request.url);
    const event_id = searchParams.get("event_id");

    if (!event_id) {
      return NextResponse.json(
        { error: "Event ID is required" },
        { status: 400 }
      );
    }

    // Verify user owns this event
    const { data: event, error: eventError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", event_id)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const eventForGet = event as Campaign;

    if (!(await userCanAdminCampaign(supabase, user, eventForGet))) {
      return NextResponse.json(
        { error: "You do not have permission to view invites for this event" },
        { status: 403 }
      );
    }

    // Fetch invites for this event
    const { data: invites, error: fetchError } = await supabase
      .from("event_invites")
      .select("*")
      .eq("campaign_id", event_id)
      .order("sent_at", { ascending: false });

    if (fetchError) {
      console.error("Error fetching invites:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch invites" },
        { status: 500 }
      );
    }

    return NextResponse.json({ invites }, { status: 200 });
  } catch (error) {
    console.error("Error in GET /api/invites:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
