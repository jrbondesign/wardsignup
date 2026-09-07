import { NextRequest, NextResponse } from "next/server";
import { getBrandFromHost } from "@/lib/brand";
import { magicLinkEmailFrom } from "@/lib/brand/email-from";
import { getResendForBrand } from "@/lib/resend-for-brand";
import { escapeHtml } from "@/lib/html-escape";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { safeReturnPath } from "@/lib/auth-return-path";
import { getPostHogClient } from "@/lib/posthog-server";
import { consumeActionRate } from "@/lib/rate-limit";
import { consumeEmailKeyRate } from "@/lib/email-send";

function messageFromResendError(err: unknown): string {
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    const m = (err as { message: string }).message.trim();
    if (m.length > 0 && m.length < 400) return m;
  }
  return "Failed to send email. Please try again.";
}

function requestOrigin(request: NextRequest): string {
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host")?.split(",")[0]?.trim() ??
    "";
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    // Local dev has no x-forwarded-proto and no TLS.
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  if (!host) return "";
  return `${proto}://${host}`;
}

function parseJsonBody(raw: string): { email?: unknown; next?: unknown } | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as { email?: unknown; next?: unknown };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    const body = parseJsonBody(raw);
    if (!body) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 },
      );
    }
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const nextParam =
      typeof body.next === "string" ? safeReturnPath(body.next) : null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 },
      );
    }

    const rate = await consumeActionRate("magic_link", request, 10);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many sign-in requests from this network. Please try again later." },
        { status: 429 },
      );
    }

    // Per-recipient cap: IP limits don't stop a rotating sender from mailing
    // one stranger repeatedly. 3 links/hour per address is plenty for a human.
    const perRecipient = await consumeEmailKeyRate(
      "magic_link_recipient",
      `magic-link:${email.toLowerCase()}`,
      3,
    );
    if (!perRecipient) {
      return NextResponse.json(
        { error: "Too many sign-in links requested for this address. Please try again later." },
        { status: 429 },
      );
    }

    const origin = requestOrigin(request);
    if (!origin) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const hostHeader = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const brand = getBrandFromHost(hostHeader);

    let callbackUrl = `${origin}/auth/callback`;
    if (nextParam) {
      callbackUrl += `?next=${encodeURIComponent(nextParam)}`;
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: callbackUrl },
    });

    // Use token_hash flow to bypass PKCE — admin-generated links have no client
    // verifier, so we send a direct callback URL using the hashed token instead
    // of the action_link. The callback handles this via supabase.auth.verifyOtp().
    const hashedToken = data?.properties?.hashed_token;
    if (error || !hashedToken) {
      console.error("send-magic-link generateLink:", error);
      return NextResponse.json(
        {
          error:
            error?.message ??
            "Could not create a sign-in link. Please try again.",
        },
        { status: 500 },
      );
    }

    // Build a direct token_hash callback URL (no PKCE verifier needed)
    let actionLink = `${origin}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=magiclink`;
    if (nextParam) {
      actionLink += `&next=${encodeURIComponent(nextParam)}`;
    }

    const resend = getResendForBrand(brand);
    if (!resend) {
      console.error("send-magic-link: Resend API key missing for this brand");
      return NextResponse.json(
        { error: "Email is not configured." },
        { status: 503 },
      );
    }
    const from = magicLinkEmailFrom(brand);
    const subject = `Sign in to ${brand.shortName}`;
    const safeName = escapeHtml(brand.name);
    const safeLink = escapeHtml(actionLink);
    const safeSiteUrl = escapeHtml(brand.siteUrl);
    const safeSiteHost = escapeHtml(brand.siteHost);

    // Look up organizer logo for Ministry brand (non-fatal)
    let organizerLogoUrl: string | null = null;
    if (brand.id === "ministrysignup") {
      try {
        const adminClient = createServiceRoleClient();
        const { data: profile } = await adminClient
          .from("organizer_profiles")
          .select("logo_url")
          .eq("email_lower", email.toLowerCase())
          .maybeSingle();
        organizerLogoUrl = (profile as any)?.logo_url ?? null;
      } catch {
        // Non-fatal: email sends without logo if lookup fails
      }
    }

    const logoBlock = organizerLogoUrl
      ? `<div style="text-align:center;margin-bottom:20px;">
           <img src="${escapeHtml(organizerLogoUrl)}" alt="Organizer logo" width="64" height="64"
                style="border-radius:10px;object-fit:cover;display:inline-block;" />
         </div>`
      : "";

    const { error: sendErr } = await resend.emails.send({
      from,
      to: email,
      subject,
      text: `Sign in to ${brand.name}\n\n${actionLink}\n\n${brand.name} · ${brand.siteHost}\nMade with ❤️ in Arizona`,
      html: `
        <div style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0D2B35;">
          ${logoBlock}
          <p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">Click below to sign in to ${safeName}:</p>
          <p style="margin: 0 0 32px;">
            <a href="${safeLink}" style="color: #0E96B0; font-size: 16px; font-weight: 600; text-decoration: underline;">Log in</a>
          </p>
          <p style="font-size: 12px; color: #5A8399; margin: 0; line-height: 1.6;">
            <a href="${safeSiteUrl}" style="color: #5A8399; text-decoration: none;">${safeName} · ${safeSiteHost}</a><br>
            Made with ❤️ in Arizona
          </p>
        </div>
      `,
    });

    if (sendErr) {
      console.error("send-magic-link resend:", sendErr);
      return NextResponse.json(
        { error: messageFromResendError(sendErr) },
        { status: 500 },
      );
    }

    const posthog = getPostHogClient();
    posthog.capture({
      // Browser's PostHog distinct id, so this event lands on the same person
      // as the client-side session; email stays a property, never a distinct id.
      distinctId:
        request.headers.get("x-posthog-distinct-id") ??
        `anon_magic_link_${crypto.randomUUID()}`,
      event: "magic_link_requested",
      properties: {
        email,
        brand_id: brand.id,
        has_next_redirect: Boolean(nextParam),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("send-magic-link:", e);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
