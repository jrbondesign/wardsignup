import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  creatorNotifyEmailFrom,
  getBrandFromHost,
  welcomeEmailFrom,
} from "@/lib/brand";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { escapeHtml } from "@/lib/html-escape";
import { getResendForBrand } from "@/lib/resend-for-brand";
const creatorNotifyTo = process.env.CREATOR_NOTIFY_TO || "jon@jrbond.com";

/** Welcome replies: must be an address that receives mail (e.g. Cloudflare Email Routing → your inbox). */
const welcomeReplyTo =
  process.env.WELCOME_REPLY_TO?.trim() || "jonathan@wardsignup.com";

/** Comma-separated emails that never trigger “new creator” founder email (lowercased). */
function creatorNotifySkipEmails(): Set<string> {
  const raw = process.env.CREATOR_NOTIFY_SKIP_EMAILS?.trim();
  const set = new Set<string>();
  set.add(creatorNotifyTo.trim().toLowerCase());
  if (raw) {
    for (const part of raw.split(",")) {
      const e = part.trim().toLowerCase();
      if (e) set.add(e);
    }
  }
  return set;
}

function alreadyWelcomedForBrand(
  meta: { welcome_sent_by_brand?: Record<string, unknown> } | undefined,
  brandId: string,
): boolean {
  const v = meta?.welcome_sent_by_brand?.[brandId];
  return v === true || v === "true";
}

export async function POST(request: NextRequest) {
  try {
    const host =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const brand = getBrandFromHost(host);

    // Extract JWT token from Authorization header
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Authorization token required" },
        { status: 401 }
      );
    }

    // Create Supabase client with the JWT token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "User authentication required" },
        { status: 401 }
      );
    }

    // Prefer Auth server identity — JWT can lag or omit email in edge cases
    let canonicalUser = user;
    let adminForWelcome: ReturnType<typeof createServiceRoleClient> | null = null;
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        adminForWelcome = createServiceRoleClient();
        const { data: adminUserData, error: adminGetErr } =
          await adminForWelcome.auth.admin.getUserById(user.id);
        if (!adminGetErr && adminUserData.user) {
          canonicalUser = adminUserData.user;
        }
      } catch {
        adminForWelcome = null;
      }
    }

    const normalizedEmail = canonicalUser.email?.trim().toLowerCase() ?? "";

    // One welcome per brand (same email can get Ward + Ministry welcomes separately)
    if (
      alreadyWelcomedForBrand(
        canonicalUser.user_metadata as
          | { welcome_sent_by_brand?: Record<string, unknown> }
          | undefined,
        brand.id,
      )
    ) {
      return NextResponse.json({ skipped: true, reason: "Already sent" });
    }

    // Durable idempotency: atomic claim in Postgres (auth.users email + unique constraints)
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("welcome: SUPABASE_SERVICE_ROLE_KEY missing — cannot dedupe");
      return NextResponse.json({
        skipped: true,
        reason: "Welcome email unavailable (server configuration)",
      });
    }

    const resend = getResendForBrand(brand);
    if (!resend) {
      console.error("welcome: Resend API key missing for brand", brand.id);
      return NextResponse.json(
        { error: "Email is not configured." },
        { status: 503 },
      );
    }

    try {
      if (!adminForWelcome) {
        adminForWelcome = createServiceRoleClient();
      }
      const { data: claimed, error: claimRpcErr } = await adminForWelcome.rpc(
        "try_claim_welcome_email",
        { p_user_id: user.id, p_brand_id: brand.id } as never,
      );
      if (claimRpcErr) {
        console.error("try_claim_welcome_email:", claimRpcErr);
        return NextResponse.json(
          { error: "Could not verify welcome status" },
          { status: 500 },
        );
      }
      if (claimed !== true) {
        return NextResponse.json({ skipped: true, reason: "Already sent" });
      }
    } catch (e) {
      console.error("Welcome claim:", e);
      return NextResponse.json({ error: "Config error" }, { status: 500 });
    }

    if (adminForWelcome) {
      const { data: existingProfile } = await adminForWelcome
        .from("organizer_profiles")
        .select("brand_id")
        .eq("user_id", user.id)
        .eq("brand_id", brand.id)
        .maybeSingle();
      const prof = existingProfile as { brand_id: string } | null;
      if (!prof) {
        const { error: profErr } = await adminForWelcome.from("organizer_profiles").insert({
          user_id: user.id,
          brand_id: brand.id,
        } as never);
        if (profErr) {
          console.error("organizer_profiles insert (welcome):", profErr);
        }
      }
    }

    // Extract first name from email or metadata
    const firstName =
      canonicalUser.user_metadata?.full_name?.split(" ")[0] ||
      canonicalUser.user_metadata?.name?.split(" ")[0] ||
      canonicalUser.email?.split("@")[0] ||
      "there";

    const welcomeSubject = brand.email.welcomeSubject;
    const safeFirst = escapeHtml(firstName);
    const quickPlain = brand.email.welcomeQuickStartBold;
    const welcomeText = `Hi ${firstName},

Thanks for signing up — you're one of our very first users!

Quick start: ${quickPlain}

This is beta, so if anything feels off, just reply. I read every message.

One quick question: What's the first event you plan to use it for?

Thanks again,
Jonathan

${brand.name} · ${brand.siteUrl}
Made with ❤️ in Arizona`;

    // Send welcome email (must succeed before we mark welcome_sent)
    const welcomeSend = await resend.emails.send({
      from: welcomeEmailFrom(brand),
      replyTo: welcomeReplyTo,
      to: canonicalUser.email!,
      subject: welcomeSubject,
      text: welcomeText,
      html: `
        <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #0D2B35;">

          <p style="font-size: 16px; line-height: 1.7; margin: 0 0 16px;">Hi ${safeFirst},</p>

          <p style="font-size: 16px; line-height: 1.7; margin: 0 0 16px;">
            Thanks for signing up — you're one of our very first users!
          </p>

          <p style="font-size: 16px; line-height: 1.7; margin: 0 0 16px;">
            <strong>Quick start:</strong> ${escapeHtml(quickPlain)}
          </p>

          <p style="font-size: 16px; line-height: 1.7; margin: 0 0 16px;">
            This is beta, so if anything feels off, just reply. I read every message.
          </p>

          <p style="font-size: 16px; line-height: 1.7; margin: 0 0 24px;">
            One quick question: What's the first event you plan to use it for?
          </p>

          <p style="font-size: 16px; line-height: 1.7; margin: 0 0 4px;">Thanks again,</p>
          <p style="font-size: 16px; line-height: 1.7; margin: 0 0 24px;">Jonathan</p>

          <div style="margin: 0; padding: 0; color: #5A8399;">
            <div style="margin: 0; padding: 0; font-size: 14px; line-height: 1.45;">
              ${escapeHtml(brand.name)} · <a href="${escapeHtml(brand.siteUrl)}" style="color: #0E96B0; text-decoration: none;">${escapeHtml(brand.siteHost)}</a>
            </div>
            <div style="margin: 0; padding: 0; font-size: 13px; line-height: 1.45;">
              Made with ❤️ in Arizona
            </div>
          </div>

        </div>
      `,
    });

    if (welcomeSend.error) {
      console.error("Welcome email Resend error:", welcomeSend.error);
      if (adminForWelcome) {
        await adminForWelcome
          .from("welcome_email_sent")
          .delete()
          .eq("user_id", user.id)
          .eq("brand_id", brand.id);
      }
      return NextResponse.json(
        { error: welcomeSend.error.message || "Could not send welcome email" },
        { status: 502 },
      );
    }

    // Founder notify: atomic slot per email (RPC); never for founder / internal inboxes
    const skipFounderFor = creatorNotifySkipEmails();
    let shouldNotifyFounder = false;
    if (
      normalizedEmail &&
      !skipFounderFor.has(normalizedEmail) &&
      adminForWelcome
    ) {
      try {
        const { data: notifyFirst, error: notifyRpcErr } =
          await adminForWelcome.rpc("try_insert_creator_signup_notification", {
            p_email: normalizedEmail,
          } as never);
        if (notifyRpcErr) {
          console.error("try_insert_creator_signup_notification:", notifyRpcErr);
        } else if (notifyFirst === true) {
          shouldNotifyFounder = true;
        }
      } catch (e) {
        console.error("Creator notify dedupe:", e);
      }
    }

    // Notify founder of a new creator (best-effort; do not block login)
    if (shouldNotifyFounder) {
      try {
        const notifySend = await resend.emails.send({
          from: creatorNotifyEmailFrom(brand),
          to: creatorNotifyTo,
          subject: `New ${brand.name} creator`,
          html: `
          <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; max-width: 640px; margin: 0 auto; padding: 24px; color: #111827;">
            <h2 style="margin: 0 0 12px; font-size: 18px;">New creator signed in</h2>
            <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6;">
              <strong>Email:</strong> ${escapeHtml(canonicalUser.email ?? "(none)")}
            </p>
            <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6;">
              <strong>Name:</strong> ${escapeHtml(String(canonicalUser.user_metadata?.full_name ?? canonicalUser.user_metadata?.name ?? "(none)"))}
            </p>
            <p style="margin: 0; font-size: 12px; color: #6b7280;">
              User ID: ${escapeHtml(canonicalUser.id)}
            </p>
          </div>
        `,
        });
        if (notifySend.error) {
          console.error("Creator notify Resend error:", notifySend.error);
        }
      } catch (notifyErr) {
        console.error("Creator notify email error:", notifyErr);
      }
    }

    // Persist per-brand welcome flags so future JWTs skip duplicate sends on this brand only
    const prevMeta = (canonicalUser.user_metadata as Record<string, unknown>) ?? {};
    const prevBrands =
      (prevMeta.welcome_sent_by_brand as Record<string, boolean> | undefined) ?? {};
    const merged = {
      ...prevMeta,
      welcome_sent_by_brand: { ...prevBrands, [brand.id]: true },
    };
    if (adminForWelcome) {
      const { error: adminMetaErr } = await adminForWelcome.auth.admin.updateUserById(
        canonicalUser.id,
        { user_metadata: merged },
      );
      if (adminMetaErr) {
        console.error("welcome_sent admin updateUserById:", adminMetaErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error sending welcome email:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
