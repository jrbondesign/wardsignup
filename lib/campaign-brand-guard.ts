import type { PublicBrand } from "@/lib/brand/types";

/** Cross-tenant check: campaign rows must match the request host’s brand. */
export function campaignMatchesHostBrand(
  campaignBrandId: string | null | undefined,
  hostBrand: PublicBrand,
): boolean {
  const id = campaignBrandId ?? "wardsignup";
  return id === hostBrand.id;
}
