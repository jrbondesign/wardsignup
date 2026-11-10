import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandId } from "@/lib/brand";
import type { PublicBrand } from "@/lib/brand";

export interface AttributionData {
  first_touch_utm_source?: string;
  first_touch_utm_medium?: string;
  first_touch_utm_campaign?: string;
  first_touch_ref?: string;
}

export interface HeardAboutData {
  choice: string;
  other_text?: string | null;
}

/**
 * Ensure the signed-in user has an organizer profile for this brand (one row per user and brand).
 * Inserts a row for (user_id, brand_id) on first use of that site.
 * 
 * @param attribution - Optional first-touch attribution to set (only written if columns are null)
 * @param heardAbout - Optional "How did you hear about us?" answer (only written if columns are null)
 */
export async function ensureOrganizerBrandMatchesHost(
  supabase: SupabaseClient,
  userId: string,
  brand: PublicBrand,
  attribution?: AttributionData | null,
  heardAbout?: HeardAboutData | null,
): Promise<{ ok: true; brandId: BrandId } | { ok: false; message: string }> {
  const { data: existing, error: selErr } = await supabase
    .from("organizer_profiles")
    .select("brand_id, first_touch_utm_source, heard_about_choice")
    .eq("user_id", userId)
    .eq("brand_id", brand.id)
    .maybeSingle();

  if (selErr) {
    console.error("organizer_profiles select:", selErr);
    return { ok: false, message: "Could not verify account" };
  }

  if (!existing) {
    // New profile: write attribution and heard_about if provided
    const insertData: Record<string, unknown> = {
      user_id: userId,
      brand_id: brand.id,
    };
    
    if (attribution) {
      if (attribution.first_touch_utm_source) insertData.first_touch_utm_source = attribution.first_touch_utm_source;
      if (attribution.first_touch_utm_medium) insertData.first_touch_utm_medium = attribution.first_touch_utm_medium;
      if (attribution.first_touch_utm_campaign) insertData.first_touch_utm_campaign = attribution.first_touch_utm_campaign;
      if (attribution.first_touch_ref) insertData.first_touch_ref = attribution.first_touch_ref;
      insertData.first_touch_captured_at = new Date().toISOString();
    }
    
    if (heardAbout) {
      insertData.heard_about_choice = heardAbout.choice;
      if (heardAbout.other_text) insertData.heard_about_other_text = heardAbout.other_text;
      insertData.heard_about_answered_at = new Date().toISOString();
    }
    
    const { error: insErr } = await supabase.from("organizer_profiles").insert(insertData as never);
    if (insErr) {
      console.error("organizer_profiles insert:", insErr);
      return { ok: false, message: "Could not complete account setup" };
    }
    return { ok: true, brandId: brand.id };
  }

  // Profile exists: only write attribution if columns are currently null
  if (attribution && existing.first_touch_utm_source === null) {
    const updateData: Record<string, unknown> = {};
    if (attribution.first_touch_utm_source) updateData.first_touch_utm_source = attribution.first_touch_utm_source;
    if (attribution.first_touch_utm_medium) updateData.first_touch_utm_medium = attribution.first_touch_utm_medium;
    if (attribution.first_touch_utm_campaign) updateData.first_touch_utm_campaign = attribution.first_touch_utm_campaign;
    if (attribution.first_touch_ref) updateData.first_touch_ref = attribution.first_touch_ref;
    if (Object.keys(updateData).length > 0) {
      updateData.first_touch_captured_at = new Date().toISOString();
      await supabase
        .from("organizer_profiles")
        .update(updateData as never)
        .eq("user_id", userId)
        .eq("brand_id", brand.id)
        .is("first_touch_utm_source", null);
    }
  }
  
  // Profile exists: only write heard_about if columns are currently null
  if (heardAbout && existing.heard_about_choice === null) {
    const heardUpdateData: Record<string, unknown> = {
      heard_about_choice: heardAbout.choice,
      heard_about_answered_at: new Date().toISOString(),
    };
    if (heardAbout.other_text) heardUpdateData.heard_about_other_text = heardAbout.other_text;
    
    await supabase
      .from("organizer_profiles")
      .update(heardUpdateData as never)
      .eq("user_id", userId)
      .eq("brand_id", brand.id)
      .is("heard_about_choice", null);
  }

  return { ok: true, brandId: existing.brand_id as BrandId };
}
