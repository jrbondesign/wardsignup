import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthFromRequest } from "@/lib/auth";
import { userIsAcceptedOrgMember } from "@/lib/campaign-access";
import { getBrandFromHost, inviteEmailFrom, publicSiteOriginFromRequest } from "@/lib/brand";
import { escapeHtml } from "@/lib/html-escape";
import { hasEmailProviderConfigured } from "@/lib/email-deliver";
import { sendGuardedEmail } from "@/lib/email-send";
import { cutoverOperationKey } from "@/lib/email-operation-key";
import { cutoverBlocksNewLogin } from "@/lib/email-cutover";
import { isBrevoCutoverEnabled } from "@/lib/email-cutover-config";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { buildBrandSignatureFooterHtml } from "@/lib/site-footer";
import { getPostHogClient } from "@/lib/posthog-server";
import { isRealOrgId, isTestOrgId, isTestOwnerEmail } from "@/lib/test-orgs";

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
    const { supabase, user } = auth;

    if (!(await userIsAcceptedOrgMember(supabase, user, orgId))) {
      return NextResponse.json({ error: "Not authorized to view members" }, { status: 403 });
    }

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

    const gateOn = isBrevoCutoverEnabled();
    const opScope = `org-member:${org.id}:${rawEmail}`;
    const holder = crypto.randomUUID();
    let leaseAdmin: ReturnType<typeof createServiceRoleClient> | null = null;
    let token = crypto.randomBytes(32).toString("hex");
    let tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Re-invite cooldown: refreshing the token is fine, but re-emailing the
    // same address more than once per hour is not.
    const { data: prevRow } = await supabase
      .from("organization_members")
      .select("invite_last_sent_at")
      .eq("organization_id", org.id)
      .eq("invited_email", rawEmail)
      .maybeSingle();
    const lastSent = (prevRow as { invite_last_sent_at?: string | null } | null)?.invite_last_sent_at;
    if (lastSent && Date.now() - new Date(lastSent).getTime() < 60 * 60 * 1000) {
      return NextResponse.json(
        { error: "An invite was just sent to this address. Try again in an hour." },
        { status: 429 },
      );
    }

    if (gateOn) {
      // An attempt that may already have been delivered keeps its token.
      if (await cutoverBlocksNewLogin(opScope)) {
        return NextResponse.json({ ok: true, delivery: "unconfirmed" });
      }
      leaseAdmin = createServiceRoleClient();
      const { data: lease, error: leaseError } = await leaseAdmin.rpc("email_operation_acquire", {
        p_scope: opScope,
        p_holder: holder,
        p_stale_seconds: 180,
      } as never);
      if (leaseError || lease !== "go") {
        if (lease === "busy") {
          return NextResponse.json(
            { error: "An invite to this address is already being sent." },
            { status: 409 },
          );
        }
        if (lease === "blocked") {
          return NextResponse.json({ ok: true, delivery: "unconfirmed" });
        }
        if (lease === "queued") {
          return NextResponse.json({ ok: true, delivery: "queued" }, { status: 202 });
        }
        if (lease === "settled") {
          return NextResponse.json({ ok: true, delivery: "sent" });
        }
        console.error("email_operation_acquire failed:", leaseError);
        return NextResponse.json(
          { error: "The invite could not be started. Please try again later.", retryable: true },
          { status: 503 },
        );
      }
      // A retry of an attempt that was not accepted reuses the same link.
      // The plaintext lives on the service-role lease, not on the member row.
      // A settled attempt has cleared it, so this mints a new one only for an
      // intentional reissue after the cooldown.
      const { data: saved, error: recallError } = await leaseAdmin.rpc("email_operation_recall", {
        p_scope: opScope,
      } as never);
      const recalled = saved as unknown;
      if (recallError) {
        console.error("email_operation_recall failed:", recallError);
        await leaseAdmin.rpc("email_operation_finish", {
          p_scope: opScope,
          p_holder: holder,
          p_state: "failed",
        } as never);
        return NextResponse.json(
          { error: "The invite could not be started. Please try again later.", retryable: true },
          { status: 503 },
        );
      }
      if (typeof recalled === "string" && recalled.length > 0) {
        token = recalled;
        tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      } else {
        const { data: remembered, error: rememberError } = await leaseAdmin.rpc("email_operation_remember", {
          p_scope: opScope,
          p_holder: holder,
          p_token: token,
        } as never);
        if (rememberError || remembered !== true) {
          console.error("email_operation_remember failed:", rememberError);
          await leaseAdmin.rpc("email_operation_finish", {
            p_scope: opScope,
            p_holder: holder,
            p_state: "failed",
          } as never);
          return NextResponse.json(
            { error: "The invite could not be started. Please try again later.", retryable: true },
            { status: 503 },
          );
        }
      }
    }

    // Upsert by (organization_id, invited_email) — re-inviting refreshes the token + status.
    // Plaintext accept_token stays null. A gate-on retry reads the link from
    // the service-role lease instead.
    const { data: memberRow, error: insertErr } = await supabase
      .from("organization_members")
      .upsert(
        {
          organization_id: org.id,
          invited_email: rawEmail,
          invited_by: user.id,
          role: "admin",
          status: "pending",
          accept_token: null,
          accept_token_hash: tokenHash,
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

    if (!hasEmailProviderConfigured(hostBrand)) {
      if (leaseAdmin) {
        await leaseAdmin.rpc("email_operation_finish", {
          p_scope: opScope,
          p_holder: holder,
          p_state: "failed",
        } as never);
      }
      // Persist the invite but tell the caller email failed.
      return NextResponse.json(
        { error: "Email is not configured for this site.", member: memberRow },
        { status: 503 },
      );
    }

    if (gateOn && leaseAdmin) {
      // The token is already stored. Marking HTTP does not replace it. If this
      // returns false, no provider call is made.
      const { data: marked, error: markError } = await leaseAdmin.rpc("email_operation_mark_http", {
        p_scope: opScope,
        p_holder: holder,
      } as never);
      if (markError || marked !== true) {
        console.error("email_operation_mark_http failed:", markError);
        await leaseAdmin.rpc("email_operation_finish", {
          p_scope: opScope,
          p_holder: holder,
          p_state: "failed",
        } as never);
        return NextResponse.json(
          {
            error: "Invite saved but email failed to send.",
            retryable: true,
            member: memberRow,
          },
          { status: 503 },
        );
      }
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
      : `As a co-admin you can edit and delete events, manage signups, and view analytics. Only the owner can invite or remove co-admins and manage the organization.`;

    try {
      const inviteKey = cutoverOperationKey("org_member_invite", [org.id, rawEmail, tokenHash]);
      const send = await sendGuardedEmail({
        brand: hostBrand,
        urgent: true,
      category: "notification",
        from: inviteEmailFrom(hostBrand),
        to: rawEmail,
        kind: "org_member_invite",
        idempotencyKey: inviteKey,
        operationScope: opScope,
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
      const memberId = (memberRow as { id: string }).id;
      const queued = Boolean(send.queued);
      const ambiguous = !send.ok && Boolean(send.ambiguous);
      const retryable = !send.ok && Boolean(send.retryable);
      // One database call finishes the lease and clears the token. A separate
      // clear would leave a sending row with no token, and a later request
      // would mint a second link for an attempt that may already have been accepted.
      // A queued copy is not that finish. The token stays, and the drain writes
      // accepted, rejected, or ambiguous onto the same key.
      const disposition = send.ok && !queued
        ? "accepted"
        : ambiguous
          ? "ambiguous"
          : retryable
            ? "retryable"
            : "terminal";
      if (gateOn && leaseAdmin && queued && inviteKey) {
        const { error: queueError } = await leaseAdmin.rpc("email_operation_mark_queued", {
          p_scope: opScope,
          p_holder: holder,
          p_key: inviteKey,
        } as never);
        if (queueError) console.error("email_operation_mark_queued failed:", queueError);
      } else if (gateOn && leaseAdmin) {
        const { error: finishError } = await leaseAdmin.rpc("email_operation_finish", {
          p_scope: opScope,
          p_holder: holder,
          p_state: disposition,
        } as never);
        if (finishError) console.error("email_operation_finish failed:", finishError);
        if (disposition === "accepted" || disposition === "ambiguous") {
          await supabase
            .from("organization_members")
            .update({ invite_last_sent_at: new Date().toISOString() } as never)
            .eq("id", memberId);
        }
      }
      if (queued) {
        return NextResponse.json(
          { ok: true, delivery: "queued", member: memberRow },
          { status: 202 },
        );
      }
      if (!send.ok) {
        console.error("Invite member: email error:", send.error || send.skipped);
        if (send.ambiguous) {
          return NextResponse.json({ ok: true, delivery: "unconfirmed", member: memberRow });
        }
        return NextResponse.json(
          {
            error: "Invite saved but email failed to send.",
            retryable: Boolean(send.retryable),
            member: memberRow,
          },
          { status: send.retryable ? 503 : 502 },
        );
      }
      if (!gateOn) {
        await supabase
          .from("organization_members")
          .update({ invite_last_sent_at: new Date().toISOString() } as never)
          .eq("id", memberId);
      }
    } catch (emailError) {
      console.error("Invite member: email error:", emailError);
      if (leaseAdmin) {
        await leaseAdmin.rpc("email_operation_finish", {
          p_scope: opScope,
          p_holder: holder,
          p_state: "failed",
        } as never).then(undefined, () => undefined);
      }
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
    // Co-admin findability: one event per co-admin invite email actually sent
    // (ownership handoff invites are excluded; they stay on org_member_invited).
    // The inviter is always the owner, so the owner email check uses user.email.
    if (!transferOwnership) {
      posthog.capture({
        distinctId: user.id,
        event: "coadmin_invite_sent",
        properties: {
          org_id: org.id,
          is_test_org: !isRealOrgId(org.id) && (isTestOwnerEmail(user.email) || isTestOrgId(org.id)),
          brand_id: org.brand_id,
        },
      });
    }

    return NextResponse.json({ member: memberRow }, { status: 201 });
  } catch (error) {
    console.error("POST /api/organizations/[id]/members:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
