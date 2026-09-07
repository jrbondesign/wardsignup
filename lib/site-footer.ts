import type { PublicBrand } from "@/lib/brand";
import { getDefaultPublicBrand } from "@/lib/brand";

/** Canonical public site URL (no trailing slash). Env override for APIs/crons without request host. */
export const SITE_URL =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")) ||
  "https://wardsignup.com";

/** Display host for links (no protocol). */
export const SITE_HOST = (() => {
  try {
    return new URL(SITE_URL).host;
  } catch {
    return "wardsignup.com";
  }
})();

/** Organizer digest / instant emails — privacy line (plain text). */
export const ORGANIZER_EMAIL_PRIVACY_LINE =
  "You receive this because you organize this event. Signup information is visible to organizers so you can run your event.";

/** Participant confirmation / reminder — privacy line (plain text). */
export const PARTICIPANT_EMAIL_PRIVACY_LINE =
  "You receive this because you signed up for an event. Your contact info is shared with the event organizer only — we never sell your data.";

export function buildOrganizerEmailFooterHtml(
  brand: PublicBrand = getDefaultPublicBrand(),
): string {
  const site = brand.siteUrl;
  const host = brand.siteHost;
  const tdStyle = "font-size:12px;color:#5A8399;line-height:1.6;word-break:break-word;overflow-wrap:break-word;";
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;border-collapse:collapse;">
      <tr><td style="${tdStyle}padding-top:16px;margin-top:28px;border-top:1px solid rgba(14,150,176,0.2);">
        ${ORGANIZER_EMAIL_PRIVACY_LINE}
      </td></tr>
      <tr><td style="${tdStyle}padding-top:10px;">
        Know someone who could use this?<br>
        Share <a href="${site}" style="color:#0E96B0;font-weight:600;text-decoration:none;">${host}</a> with a friend.
      </td></tr>
      <tr><td style="${tdStyle}padding-top:12px;">
        Made with ♥ from Arizona ·
        <a href="${site}" style="color:#0E96B0;text-decoration:none;">${brand.name}</a>
      </td></tr>
    </table>
  `;
}

/**
 * Minimal brand footer block — matches the welcome email signature.
 * `{Brand} · {host}` link line, then "Made with ❤️ in Arizona". No privacy line.
 */
export function buildBrandSignatureFooterHtml(
  brand: PublicBrand = getDefaultPublicBrand(),
): string {
  return `
    <div style="margin:0;padding:0;color:#5A8399;">
      <div style="font-size:14px;line-height:1.45;">
        ${brand.name} · <a href="${brand.siteUrl}" style="color:#0E96B0;text-decoration:none;">${brand.siteHost}</a>
      </div>
      <div style="font-size:13px;line-height:1.45;">
        Made with ❤️ in Arizona
      </div>
    </div>
  `;
}

export function buildParticipantEmailFooterHtml(
  brand: PublicBrand = getDefaultPublicBrand(),
): string {
  const site = brand.siteUrl;
  const tdStyle = "font-size:12px;color:#5A8399;line-height:1.6;word-break:break-word;overflow-wrap:break-word;";
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;border-collapse:collapse;">
      <tr><td style="${tdStyle}padding-top:16px;border-top:1px solid rgba(14,150,176,0.2);">
        ${PARTICIPANT_EMAIL_PRIVACY_LINE}
      </td></tr>
      <tr><td style="${tdStyle}padding-top:10px;">
        Need to organize your own event?
        <a href="${site}" style="color:#0E96B0;font-weight:600;text-decoration:none;word-break:break-all;">Create a free signup at ${brand.name}</a>.
      </td></tr>
      <tr><td style="${tdStyle}padding-top:12px;">
        Made with ♥ from Arizona &nbsp;·&nbsp;
        <a href="${site}" style="color:#0E96B0;text-decoration:none;">${brand.name}</a>
      </td></tr>
    </table>
  `;
}
