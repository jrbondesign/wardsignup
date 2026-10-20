import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getBrandFromHost,
  welcomeEmailFrom,
} from "@/lib/brand";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { escapeHtml } from "@/lib/html-escape";
import { getResendForBrand } from "@/lib/resend-for-brand";
import { sendGuardedEmail } from "@/lib/email-send";
import { withUtm } from "@/lib/utm";
import { buildWelcomeEmail } from "@/lib/welcome-email";

/** Welcome replies: must be an address that receives mail (e.g. Cloudflare Email Routing → your inbox). */
const welcomeReplyTo =
  process.env.WELCOME_REPLY_TO?.trim() || "jonathan@wardsignup.com";

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
    
    // Parse body early to access attribution if needed
    const body = await request.json().catch(() => ({}));

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
        .select("brand_id, first_touch_utm_source")
        .eq("user_id", user.id)
        .eq("brand_id", brand.id)
        .maybeSingle();
      const prof = existingProfile as { brand_id: string; first_touch_utm_source: string | null } | null;
      if (!prof) {
        // Get attribution from body if provided
        const attribution = body?.attribution;
        
        const insertData: Record<string, unknown> = {
          user_id: user.id,
          brand_id: brand.id,
        };
        
        if (attribution && typeof attribution === 'object') {
          if (attribution.first_touch_utm_source) insertData.first_touch_utm_source = attribution.first_touch_utm_source;
          if (attribution.first_touch_utm_medium) insertData.first_touch_utm_medium = attribution.first_touch_utm_medium;
          if (attribution.first_touch_utm_campaign) insertData.first_touch_utm_campaign = attribution.first_touch_utm_campaign;
          if (attribution.first_touch_ref) insertData.first_touch_ref = attribution.first_touch_ref;
          if (Object.keys(insertData).length > 2) {
            insertData.first_touch_captured_at = new Date().toISOString();
          }
        }
        
        const { error: profErr } = await adminForWelcome.from("organizer_profiles").insert(insertData as never);
        if (profErr) {
          console.error("organizer_profiles insert (welcome):", profErr);
        }
      } else if (prof.first_touch_utm_source === null) {
        // Profile exists but has no attribution - update it
        const attribution = body?.attribution;
        
        if (attribution && typeof attribution === 'object') {
          const updateData: Record<string, unknown> = {};
          if (attribution.first_touch_utm_source) updateData.first_touch_utm_source = attribution.first_touch_utm_source;
          if (attribution.first_touch_utm_medium) updateData.first_touch_utm_medium = attribution.first_touch_utm_medium;
          if (attribution.first_touch_utm_campaign) updateData.first_touch_utm_campaign = attribution.first_touch_utm_campaign;
          if (attribution.first_touch_ref) updateData.first_touch_ref = attribution.first_touch_ref;
          if (Object.keys(updateData).length > 0) {
            updateData.first_touch_captured_at = new Date().toISOString();
            await adminForWelcome
              .from("organizer_profiles")
              .update(updateData as never)
              .eq("user_id", user.id)
              .eq("brand_id", brand.id)
              .is("first_touch_utm_source", null);
          }
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
    const quickPlain = brand.email.welcomeQuickStartBold;
    
    // Add UTM tracking to welcome email CTA
    const siteUrlWithUtm = withUtm(brand.siteUrl, {
      utm_source: 'welcome_email',
      utm_medium: 'email',
      utm_campaign: 'creator_welcome'
    });
    
    const { text: welcomeText, html: welcomeHtml } = buildWelcomeEmail({
      firstName,
      quickPlain,
      brandName: brand.name,
      siteHost: brand.siteHost,
      siteUrlWithUtm,
    });

    // Send welcome email (must succeed before we mark welcome_sent)
    // Near real time: sends now (Resend, or Brevo when Resend is out of budget).
    // Only if neither can take it is it queued for the hourly drain.
    const welcomeSend = await sendGuardedEmail({
      brand,
      category: "transactional",
      realtime: true,
      kind: "welcome",
      from: welcomeEmailFrom(brand),
      replyTo: welcomeReplyTo,
      to: canonicalUser.email!,
      subject: welcomeSubject,
      text: welcomeText,
      html: welcomeHtml,
    });

    if (!welcomeSend.ok) {
      console.error("Welcome email send error:", welcomeSend.error || welcomeSend.skipped);
      if (adminForWelcome) {
        await adminForWelcome
          .from("welcome_email_sent")
          .delete()
          .eq("user_id", user.id)
          .eq("brand_id", brand.id);
      }
      return NextResponse.json(
        { error: welcomeSend.error || "Could not send welcome email" },
        { status: 502 },
      );
    }

    // Founder "new creator" email now fires on first event creation (lib/founder-notify.ts).

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
