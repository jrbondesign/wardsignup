import { Resend } from "resend";
import type { PublicBrand } from "@/lib/brand/types";

/**
 * Ward Signup uses RESEND_API_KEY.
 */
export function getResendApiKeyForBrand(brand: Pick<PublicBrand, "id">): string | undefined {
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
