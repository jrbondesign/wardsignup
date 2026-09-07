import { Resend } from "resend";
import type { PublicBrand } from "@/lib/brand/types";

/**
 * Ministry can use a separate Resend project/API key (second verified domain).
 * Ward / Org / fallback: `RESEND_API_KEY`.
 */
export function getResendApiKeyForBrand(brand: Pick<PublicBrand, "id">): string | undefined {
  if (brand.id === "ministrysignup") {
    const ministry = process.env.RESEND_API_KEY_MINISTRY?.trim();
    if (ministry) return ministry;
  }
  if (brand.id === "orgsignup") {
    const org = process.env.RESEND_API_KEY_ORG?.trim();
    if (org) return org;
  }
  return process.env.RESEND_API_KEY?.trim();
}

export function getResendForBrand(brand: Pick<PublicBrand, "id">): Resend | null {
  const key = getResendApiKeyForBrand(brand);
  if (!key) return null;
  return new Resend(key);
}

export function hasResendConfiguredForBrand(brand: Pick<PublicBrand, "id">): boolean {
  return Boolean(getResendApiKeyForBrand(brand));
}
