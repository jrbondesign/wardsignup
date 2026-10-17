import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { consumeActionRate } from "@/lib/rate-limit";
import { consumeEmailKeyRate } from "@/lib/email-send";
import { magicLinkDedupeBuckets, normalizeEmail } from "@/lib/email-throttle";
import { getBrandFromHost } from "@/lib/brand";
import { magicLinkEmailFrom } from "@/lib/brand/email-from";
import { getResendForBrand } from "@/lib/resend-for-brand";
import { brevoConfig, deliverEmail } from "@/lib/email-deliver";
import { escapeHtml } from "@/lib/html-escape";
import { getPostHogClient } from "@/lib/posthog-server";
import { createHash } from "crypto";

function parseJsonBody(raw: string): { token?: unknown } | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as { token?: unknown };
  } catch {
    return null;
  }
}

function requestOrigin(request: NextRequest): string {
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host")?.split(",")[0]?.trim() ??
    "";
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  if (!host) return "";
  return `${proto}://${host}`;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * POST /api/organizations/invite-magic-link
 * 
 * Sends a magic link to the email address associated with an invite token.
 * The server validates the token and sends the link only to the invited email,
 * never to an address provided by the client.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    const body = parseJsonBody(raw);
    if (!body) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Missing invite token" }, { status: 400 });
    }

    // Rate limit: per IP
    const rate = await consumeActionRate("invite_magic_link", request, 5);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    }

    // Rate limit: per invite token (prevent abuse of a single leaked token)
    const tokenHash = hashToken(token);
    const perToken = await consumeEmailKeyRate(
      "invite_magic_link_token",
      `invite:${tokenHash}`,
      3,
    );
    if (!perToken) {
      return NextResponse.json(
        { error: "Too many requests for this invitation. Please try again later." },
        { status: 429 },
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Server is not configured" },
        { status: 500 },
      );
    }

    const admin = createServiceRoleClient();

    // Validate invite and get email
    const { data: invite, error: lookupErr } = await admin.rpc(
      "validate_and_get_invite",
      { p_token_hash: tokenHash },
    );

    if (lookupErr || !invite || (Array.isArray(invite) && invite.length === 0)) {
      console.error("invite-magic-link: lookup error:", lookupErr);
      return NextResponse.json(
        { error: "Invitation not found or expired" },
        { status: 404 },
      );
    }

    const inviteData = Array.isArray(invite) ? invite[0] : invite;
    const email = normalizeEmail(inviteData.invited_email);
    const organizationName = inviteData.organization_name;

    if (!email) {
      return NextResponse.json({ error: "Invalid invitation" }, { status: 400 });
    }

    // Dedupe: if a link already went to this address in the last 5 minutes
    const [thisMinute, ...nextMinutes] = magicLinkDedupeBuckets(new Date());
    const dedupeKey = `invite-magic-link:${email}:${tokenHash}`;
    const firstInWindow = await consumeEmailKeyRate(
      "invite_magic_link_dedupe",
      dedupeKey,
      1,
      thisMinute,
    );
    if (!firstInWindow) {
      return NextResponse.json({ ok: true, alreadySent: true });
    }
    await Promise.all(
      nextMinutes.map((b) => consumeEmailKeyRate("invite_magic_link_dedupe", dedupeKey, 1, b)),
    );

    const origin = requestOrigin(request);
    if (!origin) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const hostHeader = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const brand = getBrandFromHost(hostHeader);

    // Generate magic link for this user
    const callbackUrl = `${origin}/auth/callback?next=${encodeURIComponent(`/orgs/accept?token=${encodeURIComponent(token)}`)}`;

    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: callbackUrl },
    });

    const hashedOtpToken = data?.properties?.hashed_token;
    if (error || !hashedOtpToken) {
      console.error("invite-magic-link generateLink:", error);
      return NextResponse.json(
        { error: "Could not create a sign in link. Please try again." },
        { status: 500 },
      );
    }

    // Build token_hash callback URL
    const actionLink = `${origin}/auth/callback?token_hash=${encodeURIComponent(hashedOtpToken)}&type=magiclink&next=${encodeURIComponent(`/orgs/accept?token=${encodeURIComponent(token)}`)}`;

    const resend = getResendForBrand(brand);
    if (!resend && !brevoConfig()) {
      console.error("invite-magic-link: email not configured for this brand");
      return NextResponse.json({ error: "Email is not configured." }, { status: 503 });
    }

    const from = magicLinkEmailFrom(brand);
    const subject = `Accept your invitation to ${organizationName}`;
    const safeName = escapeHtml(brand.name);
    const safeOrgName = escapeHtml(organizationName);
    const safeLink = escapeHtml(actionLink);
    const safeSiteUrl = escapeHtml(brand.siteUrl);
    const safeSiteHost = escapeHtml(brand.siteHost);

    const sendRes = await deliverEmail(
      {
        brand,
        from,
        to: email,
        subject,
        text: `Accept your invitation to ${organizationName}\n\n${actionLink}\n\n${brand.name} · ${brand.siteHost}\nMade with ❤️ in Arizona`,
        html: `
          <div style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0D2B35;">
            <p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">Click below to accept your invitation to <strong>${safeOrgName}</strong>:</p>
            <p style="margin: 0 0 32px;">
              <a href="${safeLink}" style="color: #0E96B0; font-size: 16px; font-weight: 600; text-decoration: underline;">Accept invitation</a>
            </p>
            <p style="font-size: 12px; color: #5A8399; margin: 0; line-height: 1.6;">
              <a href="${safeSiteUrl}" style="color: #5A8399; text-decoration: none;">${safeName} · ${safeSiteHost}</a><br>
              Made with ❤️ in Arizona
            </p>
          </div>
        `,
      },
      { urgent: true },
    );

    if (!sendRes.ok) {
      console.error("invite-magic-link send error:", sendRes.error);
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId:
        request.headers.get("x-posthog-distinct-id") ??
        `anon_invite_magic_link_${crypto.randomUUID()}`,
      event: "invite_magic_link_requested",
      properties: {
        organization_name: organizationName,
        email,
        brand_id: brand.id,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/organizations/invite-magic-link:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
