import type { PublicBrand } from "@/lib/brand";

/**
 * Canonical product vocabulary (slot / signup / event / organizer).
 * DB tables may still use legacy names (`sessions`, `member_*`); UI and user-facing API errors use these terms.
 */
export const PRODUCT_LABELS = {
  event: { singular: "Event", plural: "Events" },
  slot: { singular: "Slot", plural: "Slots" },
  signup: { singular: "Signup", plural: "Signups" },
  organizer: { singular: "Organizer", plural: "Organizers" },
  participant: { singular: "Participant", plural: "Participants" },
} as const;

export type ProductLabelKey = keyof typeof PRODUCT_LABELS;

/** Optional per-brand overrides (future); defaults are canonical glossary. */
export function getProductLabels(_brand: PublicBrand): typeof PRODUCT_LABELS {
  return PRODUCT_LABELS;
}
