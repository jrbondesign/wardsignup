import type { PublicBrand } from "@/lib/brand/types";

/**
 * FAQ page title and description. GSC showed /faq at avg position ~1.1 with
 * 280 impressions and 1 click, so the snippet leads with the two questions
 * people search for (cost, member accounts). Keep it accurate to the page and
 * free of dashes.
 */
export function faqMeta(brand: Pick<PublicBrand, "shortName">) {
  const title = `${brand.shortName} FAQ: Is It Free? Do Members Need an Account?`;
  const description = `Is ${brand.shortName} free? Do members need an account? Quick answers on free LDS ward signup sheets: time slots, spot limits, leader access, privacy, and no ads.`;
  return { title, description };
}
