import type { BrandId, PublicBrand } from "./types";

type BrandDefinition = Omit<
  PublicBrand,
  "siteHost"
> & {
  /** Hostnames that map to this brand (lowercase, no port). */
  hosts: string[];
};

const WARDSIGNUP: BrandDefinition = {
  id: "wardsignup",
  name: "Ward Signup",
  shortName: "Ward Signup",
  metadataTitle: "Ward Signup — Simple scheduling for your ward",
  metadataDescription:
    "Create time slots, set spots per session, and share a signup link — no logins required for members.",
  twitterDescription: "Simple scheduling for your ward",
  siteUrl: "https://wardsignup.com",
  supportEmail: "support@wardsignup.com",
  tipJarUrl: "https://github.com/sponsors/jrbondesign",
  logoSrc: "/lds-signup-logo.png",
  logoAlt: "Ward Signup",
  heroWatermarkSrc: "/ward-signup-logo-v2.png",
  homePillText: "Free to use · Built for Latter-day Saint wards & branches",
  heroLine1: "Simple scheduling",
  heroLine2Prefix: "for ",
  heroLine2Em: "your ward",
  homeSubhead:
    "Create time slots, set spots per session, and share a signup link — no logins required for members.",
  email: {
    organizerFrom: "Ward Signup <noreply@wardsignup.com>",
    inviteFrom: "Ward Signup <noreply@wardsignup.com>",
    welcomeFrom: "Jonathan <jonathan@wardsignup.com>",
    creatorNotifyFrom: "Ward Signup <noreply@wardsignup.com>",
    welcomeSubject: "You're in — a few things to know about Ward Signup",
    welcomeQuickStartBold:
      "Create an event, share the link, and members claim their slots on their phone — no login required. You can edit anytime and changes show up instantly.",
  },
  hosts: ["wardsignup.com", "www.wardsignup.com"],
};

export const BRAND_DEFINITIONS: Record<BrandId, BrandDefinition> = {
  wardsignup: WARDSIGNUP,
};

export const DEFAULT_BRAND_ID: BrandId = "wardsignup";

/** Every hostname that should be accepted without canonical redirect to another apex. */
export const ALL_BRAND_HOSTS: ReadonlySet<string> = new Set(
  Object.values(BRAND_DEFINITIONS).flatMap((b) => b.hosts),
);

function hostFromSiteUrl(siteUrl: string, fallbackHost: string): string {
  try {
    return new URL(siteUrl).host;
  } catch {
    return fallbackHost;
  }
}

export function toPublicBrand(def: BrandDefinition): PublicBrand {
  const { hosts: _, ...rest } = def;
  const fallback = def.hosts[0] ?? "";
  return {
    ...rest,
    siteHost: hostFromSiteUrl(def.siteUrl, fallback),
  };
}

export function getBrandDefinition(id: BrandId): BrandDefinition {
  return BRAND_DEFINITIONS[id];
}
