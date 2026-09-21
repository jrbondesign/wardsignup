export type BrandId = "wardsignup";

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
  /**
   * External tip jar / sponsors URL (e.g. GitHub Sponsors).
   * Omit or leave unset to fall back to the default Sponsors URL in `lib/tip-jar.ts`.
   * Hide tip-jar surfaces with `NEXT_PUBLIC_TIP_JAR_ENABLED=0`.
   */
  tipJarUrl?: string;
  logoSrc: string;
  logoAlt: string;
  /** Large faint hero background on the home page (defaults to `/logo-watermark.svg` in UI). */
  heroWatermarkSrc?: string;
  /** Home hero pill (free + audience line). */
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
