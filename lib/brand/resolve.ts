import { ALL_BRAND_HOSTS, BRAND_DEFINITIONS, DEFAULT_BRAND_ID, toPublicBrand } from "./brands";
import type { BrandId, PublicBrand } from "./types";

/** Strip port; lowercase. Empty string if missing. */
export function normalizeHost(hostHeader: string | null): string {
  if (!hostHeader) return "";
  const first = hostHeader.split(",")[0]?.trim() ?? "";
  const noPort = first.split(":")[0]?.toLowerCase() ?? "";
  return noPort;
}

function isLoopbackOrPreviewHost(host: string): boolean {
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.startsWith("127.")) return true;
  if (host.endsWith(".vercel.app")) return true;
  return false;
}

/**
 * On localhost / Vercel preview, optionally force a brand for dev (see `.env.example`).
 * Does not apply to real production hosts (so mistaken env on Vercel prod cannot switch Ward).
 */
function activeBrandEnvOverride(host: string): BrandId | null {
  const raw = process.env.NEXT_PUBLIC_ACTIVE_BRAND?.trim().toLowerCase();
  if (!raw || !(raw in BRAND_DEFINITIONS)) return null;
  if (!isLoopbackOrPreviewHost(host)) return null;
  return raw as BrandId;
}

function brandIdForHost(host: string): BrandId {
  for (const def of Object.values(BRAND_DEFINITIONS)) {
    if (def.hosts.includes(host)) return def.id;
  }
  return DEFAULT_BRAND_ID;
}

export function getBrandFromHost(hostHeader: string | null): PublicBrand {
  const host = normalizeHost(hostHeader);
  const override = activeBrandEnvOverride(host);
  const id = override ?? brandIdForHost(host);
  return toPublicBrand(BRAND_DEFINITIONS[id]);
}

export function isKnownBrandHost(hostHeader: string | null): boolean {
  const host = normalizeHost(hostHeader);
  return ALL_BRAND_HOSTS.has(host);
}

/** Server utilities that have no request host yet (cron, scripts). */
export function getDefaultPublicBrand(): PublicBrand {
  return toPublicBrand(BRAND_DEFINITIONS[DEFAULT_BRAND_ID]);
}

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, "").toLowerCase();
}

/**
 * Pick brand from a public site origin (e.g. `NEXT_PUBLIC_SITE_URL`). Used by crons when
 * there is no `Host` header. Falls back to Ward if no pack matches.
 */
export function getBrandForSiteOrigin(siteOrigin: string): PublicBrand {
  const n = normalizeOrigin(siteOrigin);
  for (const def of Object.values(BRAND_DEFINITIONS)) {
    if (normalizeOrigin(def.siteUrl) === n) return toPublicBrand(def);
  }
  return getDefaultPublicBrand();
}
