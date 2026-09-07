export type BrandId =
  | "wardsignup"
  | "ministrysignup"
  /** Reserved for a future orgsignup.com launch (not a current production domain). */
  | "orgsignup";

/** Serializable brand fields for the client (RSC → BrandProvider). */
export interface PublicBrand {
  id: BrandId;
  /** Marketing / nav product name */
  name: string;
  /** Short name for OG / metadata titles */
  shortName: string;
  metadataTitle: string;
  metadataDescription: string;
  /** Short line for Twitter card */
  twitterDescription: string;
  /** Canonical public origin, no trailing slash */
  siteUrl: string;
  /** Host only, for display links (from `siteUrl`). */
  siteHost: string;
  supportEmail: string;
  logoSrc: string;
  logoAlt: string;
  /** Large faint hero background on the home page (defaults to `/logo-watermark.svg` in UI). */
  heroWatermarkSrc?: string;
  /** Home hero pill (beta + audience line). */
  homePillText: string;
  heroLine1: string;
  heroLine2Prefix: string;
  /** Italic emphasis in hero second line (e.g. “your ward”). */
  heroLine2Em: string;
  homeSubhead: string;
  /** Transactional email defaults (override with env; see `lib/brand/email-from.ts`). */
  email: {
    organizerFrom: string;
    inviteFrom: string;
    welcomeFrom: string;
    creatorNotifyFrom: string;
    welcomeSubject: string;
    /** HTML/plain welcome body: bold “quick start” sentence. */
    welcomeQuickStartBold: string;
  };
}
