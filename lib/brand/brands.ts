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
  logoSrc: "/lds-signup-logo.png",
  logoAlt: "Ward Signup",
  heroWatermarkSrc: "/ward-signup-logo-v2.png",
  homePillText: "Free during beta · Built for Latter-day Saint wards & branches",
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

/** Reserved for orgsignup.com when that domain launches (hosts empty until then). */
const ORGSIGNUP: BrandDefinition = {
  id: "orgsignup",
  name: "Org Signup",
  shortName: "Org Signup",
  metadataTitle: "Org Signup — Simple scheduling for your organization",
  metadataDescription:
    "Create time slots, share a signup link, and let people claim a spot — no logins required for participants.",
  twitterDescription: "Simple scheduling for your organization",
  siteUrl: "https://orgsignup.com",
  supportEmail: "support@orgsignup.com",
  logoSrc: "/orgsignup-logo.png",
  logoAlt: "Org Signup",
  heroWatermarkSrc: "/orgsignup-logo.png",
  homePillText: "Free during beta · Built for teams, nonprofits, and community groups",
  heroLine1: "Simple scheduling",
  heroLine2Prefix: "for ",
  heroLine2Em: "your org",
  homeSubhead:
    "Create time slots, share a signup link, and let people claim a spot — no logins required for participants.",
  email: {
    organizerFrom: "Org Signup <noreply@orgsignup.com>",
    inviteFrom: "Org Signup <noreply@orgsignup.com>",
    welcomeFrom: "Org Signup <hello@orgsignup.com>",
    creatorNotifyFrom: "Org Signup <noreply@orgsignup.com>",
    welcomeSubject: "You're in — a few things to know about Org Signup",
    welcomeQuickStartBold:
      "Create an event, share the link, and people can claim a slot on their phone — no login required. You can edit anytime and changes show up instantly.",
  },
  hosts: ["orgsignup.com", "www.orgsignup.com", "orgsignup.localhost"],
};

/** General ministry / church scheduling — ministrysignup.com (paired with wardsignup.com). */
const MINISTRY_SIGNUP: BrandDefinition = {
  id: "ministrysignup",
  name: "Ministry Signup",
  shortName: "Ministry Signup",
  metadataTitle: "Ministry Signup — Simple scheduling for your ministry",
  metadataDescription:
    "Create time slots, set capacity per slot, and share a signup link — no accounts required for participants.",
  twitterDescription: "Simple scheduling for your ministry",
  siteUrl: "https://ministrysignup.com",
  supportEmail: "support@ministrysignup.com",
  logoSrc: "/ministry-signup-logo.png",
  logoAlt: "Ministry Signup",
  heroWatermarkSrc: "/ministry-signup-logo.png",
  homePillText: "Free during beta · Built for ministries, churches, and faith communities",
  heroLine1: "Simple scheduling",
  heroLine2Prefix: "for ",
  heroLine2Em: "your ministry",
  homeSubhead:
    "Create time slots, set spots per session, and share a signup link — no logins required for participants.",
  email: {
    organizerFrom: "Ministry Signup <noreply@ministrysignup.com>",
    inviteFrom: "Ministry Signup <noreply@ministrysignup.com>",
    welcomeFrom: "Ministry Signup <hello@ministrysignup.com>",
    creatorNotifyFrom: "Ministry Signup <noreply@ministrysignup.com>",
    welcomeSubject: "You're in — a few things to know about Ministry Signup",
    welcomeQuickStartBold:
      "Create an event, share the link, and people can claim a slot on their phone — no login required. You can edit anytime and changes show up instantly.",
  },
  hosts: ["ministrysignup.com", "www.ministrysignup.com", "ministrysignup.localhost"],
};

export const BRAND_DEFINITIONS: Record<BrandId, BrandDefinition> = {
  wardsignup: WARDSIGNUP,
  ministrysignup: MINISTRY_SIGNUP,
  orgsignup: ORGSIGNUP,
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
