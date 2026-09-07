import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAdminCampaign } from "@/lib/campaign-access";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import type { Campaign } from "@/lib/types";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const BUCKET = "event-media";

export async function POST(request: NextRequest) {
  try {
    // 1. Verify JWT
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    // 2. Parse multipart form
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    const file = form.get("file") as File | null;
    const uploadType = form.get("type") as string | null;
    const eventId = form.get("eventId") as string | null;
    const brandId = (form.get("brand") as string | null) ?? "ministrysignup";

    // 3. Validate inputs
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, or WebP images are accepted" },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File must be under 5 MB" },
        { status: 400 }
      );
    }
    if (!uploadType || !["logo", "cover"].includes(uploadType)) {
      return NextResponse.json(
        { error: "type must be 'logo' or 'cover'" },
        { status: 400 }
      );
    }
    if (uploadType === "cover" && !eventId) {
      return NextResponse.json(
        { error: "eventId is required for cover uploads" },
        { status: 400 }
      );
    }

    const admin = createServiceRoleClient();

    // 4. Ownership check for cover uploads
    if (uploadType === "cover" && eventId) {
      const { data: event, error: evErr } = await admin
        .from("campaigns")
        .select("organization_id")
        .eq("id", eventId)
        .single();
      if (evErr || !event) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 });
      }
      if (!(await userCanAdminCampaign(supabase, user, event as Pick<Campaign, "organization_id">))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // 5. Build storage path
    const ext =
      file.type === "image/jpeg" ? "jpg"
      : file.type === "image/png" ? "png"
      : "webp";
    const storagePath =
      uploadType === "logo"
        ? `${user.id}/logo.${ext}`
        : `${user.id}/events/${eventId}/cover.${ext}`;

    // 6. Upload to Supabase Storage (service role for consistency with codebase patterns)
    const bytes = await file.arrayBuffer();
    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, bytes, {
        contentType: file.type,
        upsert: true,
        cacheControl: "public, max-age=31536000, immutable",
      });
    if (uploadErr) {
      console.error("Storage upload error:", uploadErr);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    // 7. Get public URL (append cache-buster so replaced images show immediately)
    const { data: { publicUrl } } = admin.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);
    const urlWithVersion = `${publicUrl}?v=${Date.now()}`;

    // 8. Persist URL to DB
    if (uploadType === "logo") {
      // organizer_profiles has a composite PK (user_id, brand_id).
      // Upsert so it works even if the row doesn't exist yet (new users who haven't
      // triggered the welcome email yet won't have a row yet).
      const { error: updateErr } = await admin
        .from("organizer_profiles")
        .upsert({
          user_id: user.id,
          brand_id: brandId,
          logo_url: urlWithVersion,
          email_lower: user.email?.toLowerCase() ?? null,
        } as never, { onConflict: "user_id,brand_id" });
      if (updateErr) {
        console.error("organizer_profiles upsert error:", updateErr);
        return NextResponse.json(
          { error: "Failed to save logo URL" },
          { status: 500 }
        );
      }
    } else {
      // Update campaigns.cover_image_url
      const { error: patchErr } = await admin
        .from("campaigns")
        .update({ cover_image_url: urlWithVersion } as never)
        .eq("id", eventId!);
      if (patchErr) {
        console.error("campaigns cover_image_url update error:", patchErr);
        return NextResponse.json(
          { error: "Failed to save cover image URL" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ url: urlWithVersion });
  } catch (e) {
    console.error("upload route:", e);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    const { type, eventId, brand } = await request.json() as {
      type: "logo" | "cover";
      eventId?: string;
      brand?: string;
    };

    if (!type || !["logo", "cover"].includes(type)) {
      return NextResponse.json({ error: "type must be 'logo' or 'cover'" }, { status: 400 });
    }
    if (type === "cover" && !eventId) {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }

    const admin = createServiceRoleClient();

    // Ownership check for cover
    if (type === "cover" && eventId) {
      const { data: event, error: evErr } = await admin
        .from("campaigns")
        .select("organization_id")
        .eq("id", eventId)
        .single();
      if (evErr || !event) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 });
      }
      if (!(await userCanAdminCampaign(supabase, user, event as Pick<Campaign, "organization_id">))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (type === "logo") {
      const brandId = brand ?? "ministrysignup";
      // Clear DB column
      await admin
        .from("organizer_profiles")
        .update({ logo_url: null } as never)
        .eq("user_id", user.id)
        .eq("brand_id", brandId);
      // Best-effort: remove all possible extensions from storage
      for (const ext of ["jpg", "png", "webp"]) {
        await admin.storage.from(BUCKET).remove([`${user.id}/logo.${ext}`]);
      }
    } else {
      // Clear DB column
      await admin
        .from("campaigns")
        .update({ cover_image_url: null } as never)
        .eq("id", eventId!);
      // Best-effort: remove all possible extensions from storage
      for (const ext of ["jpg", "png", "webp"]) {
        await admin.storage.from(BUCKET).remove([`${user.id}/events/${eventId}/cover.${ext}`]);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("upload DELETE route:", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
