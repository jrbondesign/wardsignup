import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthFromRequest } from "@/lib/auth";
import { getBrandFromHost, inviteEmailFrom, publicSiteOriginFromRequest } from "@/lib/brand";
import { escapeHtml } from "@/lib/html-escape";
import { hasResendConfiguredForBrand } from "@/lib/resend-for-brand";
import { sendGuardedEmail } from "@/lib/email-send";
import { buildBrandSignatureFooterHtml } from "@/lib/site-footer";
import { getPostHogClient } from "@/lib/posthog-server";

const TOKEN_TTL_DAYS = 14;

/** GET /api/organizations/[id]/members — list members. Visible to org owner + accepted members. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: orgId } = await params;
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase } = auth;

    const { data, error } = await supabase
      .from("organization_members")
      .select("id, user_id, invited_email, role, status, created_at, accepted_at, transfer_on_accept")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("GET org members error:", error);
      return NextResponse.json({ error: "Failed to load members" }, { status: 500 });
    }

    return NextResponse.json({ members: data ?? [] }, { status: 200 });
  } catch (error) {
    console.error("GET /api/organizations/[id]/members:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** POST /api/organizations/[id]/members — invite a co-admin by email. Owner only. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: orgId } = await params;
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    const body = await request.json().catch(() => ({}));
    const rawEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
    }
    const transferOwnership = body?.transferOwnership === true;

    // Owner-only: confirm the calling user owns this org.
    const { data: orgRow, error: orgErr } = await supabase
      .from("organizations")
      .select("id, name, brand_id, owner_id")
      .eq("id", orgId)
      .maybeSingle();
    if (orgErr) {
      console.error("Invite member: org lookup error:", orgErr);
      return NextResponse.json({ error: "Failed to load organization" }, { status: 500 });
    }
    if (!orgRow) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    const org = orgRow as { id: string; name: string; brand_id: string; owner_id: string };
    if (org.owner_id !== user.id) {
      return NextResponse.json({ error: "Only the owner can invite co-admins" }, { status: 403 });
    }

    // For an ownership-handoff invite, refuse if a different pending handoff already
    // exists. The partial unique index would also enforce this, but a clear 409 is
    // better than a generic insert error.
    if (transferOwnership) {
      const { data: existingHandoff } = await supabase
        .from("organization_members")
        .select("id, invited_email")
        .eq("organization_id", org.id)
        .eq("transfer_on_accept", true)
        .eq("status", "pending")
        .maybeSingle();
      const existing = existingHandoff as { id: string; invited_email: string } | null;
      if (existing && existing.invited_email.toLowerCase() !== rawEmail) {
        return NextResponse.json(
          {
            error: `A pending ownership transfer to ${existing.invited_email} already exists. Cancel that invite before sending a new one.`,
          },
          { status: 409 },
        );
      }
    }

    // Brand guard: invite from the matching host (mirrors campaign brand guard).
    const hostBrand = getBrandFromHost(
      request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    );
    if (hostBrand.id !== org.brand_id) {
      return NextResponse.json(
        { error: "Open this site on the same domain as the organization to send invites." },
        { status: 403 },
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Re-invite cooldown: refreshing the token is fine, but re-emailing the
    // same address more than once per hour is not.
    const { data: prevRow } = await supabase
      .from("organization_members")
      .select("invite_last_sent_at")
      .eq("organization_id", org.id)
      .eq("invited_email", rawEmail)
      .maybeSingle();
    const lastSent = (prevRow as { invite_last_sent_at?: string | null } | null)
      ?.invite_last_sent_at;
    if (lastSent && Date.now() - new Date(lastSent).getTime() < 60 * 60 * 1000) {
      return NextResponse.json(
        { error: "An invite was just sent to this address. Try again in an hour." },
        { status: 429 },
      );
    }

    // Upsert by (organization_id, invited_email) — re-inviting refreshes the token + status.
    const { data: memberRow, error: insertErr } = await supabase
      .from("organization_members")
      .upsert(
        {
          organization_id: org.id,
          invited_email: rawEmail,
          invited_by: user.id,
          role: "admin",
          status: "pending",
          accept_token: token,
          token_expires_at: expiresAt,
          user_id: null,
          accepted_at: null,
          transfer_on_accept: transferOwnership,
        } as never,
        { onConflict: "organization_id,invited_email" },
      )
      .select("id, invited_email, role, status, created_at, transfer_on_accept")
      .single();
    if (insertErr || !memberRow) {
      console.error("Invite member: insert error:", insertErr);
      return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
    }

    if (!hasResendConfiguredForBrand(hostBrand)) {
      // Persist the invite but tell the caller email failed.
      return NextResponse.json(
        { error: "Email is not configured for this site.", member: memberRow },
        { status: 503 },
      );
    }

    const siteOrigin = publicSiteOriginFromRequest(request);
    const acceptUrl = `${siteOrigin}/orgs/accept?token=${encodeURIComponent(token)}`;
    const orgNameEsc = escapeHtml(org.name);
    const inviterEsc = escapeHtml(user.email ?? "an organizer");

    const subject = transferOwnership
      ? `You've been invited to take over ${org.name}`
      : `You've been invited to co-manage ${org.name}`;
    const introLine = transferOwnership
      ? `${inviterEsc} invited you to take over ownership of <strong style="color:#054F64;">${orgNameEsc}</strong> on ${escapeHtml(hostBrand.name)}. When you accept, ${inviterEsc} becomes a co-admin and you become the new owner.`
      : `${inviterEsc} invited you to help manage events for <strong style="color:#054F64;">${orgNameEsc}</strong> on ${escapeHtml(hostBrand.name)}.`;
    const roleLine = transferOwnership
      ? `As the owner you can manage events and signups, invite co-admins, rename the organization, and transfer ownership again later.`
      : `As a co-admin you can edit events, manage signups, send invites, and view analytics. Only the owner can delete the organization or its events.`;

    try {
      const send = await sendGuardedEmail({
        brand: hostBrand,
        category: "notification",
        from: inviteEmailFrom(hostBrand),
        to: rawEmail,
        subject,
        html: `
          <div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;min-width:0;width:100%;box-sizing:border-box;margin:0 auto;padding:40px 20px;color:#0D2B35;word-wrap:break-word;word-break:break-word;overflow-wrap:break-word;">
            <div style="font-size:13px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#0E96B0;margin:0 0 24px;">
              ${escapeHtml(hostBrand.name)}
            </div>
            <p style="font-size:16px;line-height:1.7;margin:0 0 16px;">Hi,</p>
            <p style="font-size:16px;line-height:1.7;margin:0 0 16px;">
              ${introLine}
            </p>
            <p style="font-size:16px;line-height:1.7;margin:0 0 24px;color:#2E5566;">
              ${roleLine}
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
              <tr><td style="background:#0E96B0;border-radius:8px;">
                <a href="${acceptUrl}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;">
                  Accept invitation
                </a>
              </td></tr>
            </table>
            <p style="font-size:13px;line-height:1.6;color:#5A8399;margin:0 0 6px;">
              Or copy this link:<br>
              <a href="${acceptUrl}" style="color:#0E96B0;text-decoration:none;word-break:break-all;">${acceptUrl}</a>
            </p>
            <p style="font-size:13px;line-height:1.6;color:#5A8399;margin:0 0 24px;">
              This link expires in ${TOKEN_TTL_DAYS} days.
            </p>
            <p style="font-size:12px;line-height:1.6;color:#5A8399;margin:0 0 12px;">
              You received this because someone invited you to co-manage their organization. If you weren't expecting it, you can safely ignore this email.
            </p>
            ${buildBrandSignatureFooterHtml(hostBrand)}
          </div>
        `,
      });
      if (!send.ok) {
        console.error("Invite member: email error:", send.error || send.skipped);
        return NextResponse.json(
          { error: "Invite saved but email failed to send.", member: memberRow },
          { status: 502 },
        );
      }
      await supabase
        .from("organization_members")
        .update({ invite_last_sent_at: new Date().toISOString() } as never)
        .eq("id", (memberRow as { id: string }).id);
    } catch (emailError) {
      console.error("Invite member: email error:", emailError);
      // Invite is still saved; surface the failure so the owner can retry.
      return NextResponse.json(
        { error: "Invite saved but email failed to send.", member: memberRow },
        { status: 502 },
      );
    }

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: "org_member_invited",
      properties: { organization_id: org.id, brand_id: org.brand_id, transfer_on_accept: transferOwnership },
    });

    return NextResponse.json({ member: memberRow }, { status: 201 });
  } catch (error) {
    console.error("POST /api/organizations/[id]/members:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
