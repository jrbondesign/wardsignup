import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandId } from "@/lib/brand";
import type { PublicBrand } from "@/lib/brand";

/**
 * Ensure the signed-in user has an organizer profile for this brand (same login can have Ward + Ministry).
 * Inserts a row for (user_id, brand_id) on first use of that site.
 */
export async function ensureOrganizerBrandMatchesHost(
  supabase: SupabaseClient,
  userId: string,
  brand: PublicBrand,
): Promise<{ ok: true; brandId: BrandId } | { ok: false; message: string }> {
  const { data: existing, error: selErr } = await supabase
    .from("organizer_profiles")
    .select("brand_id")
    .eq("user_id", userId)
    .eq("brand_id", brand.id)
    .maybeSingle();

  if (selErr) {
    console.error("organizer_profiles select:", selErr);
    return { ok: false, message: "Could not verify account" };
  }

  if (!existing) {
    const { error: insErr } = await supabase.from("organizer_profiles").insert({
      user_id: userId,
      brand_id: brand.id,
    } as never);
    if (insErr) {
      console.error("organizer_profiles insert:", insErr);
      return { ok: false, message: "Could not complete account setup" };
    }
    return { ok: true, brandId: brand.id };
  }

  return { ok: true, brandId: existing.brand_id as BrandId };
}
