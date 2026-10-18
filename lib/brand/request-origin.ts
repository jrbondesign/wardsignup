import { ALL_BRAND_HOSTS } from "./brands";
import { normalizeHost } from "./resolve";

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host.endsWith(".localhost") || host.startsWith("127.");
}

function requestHostParts(request: Request): { host: string; hostWithPort: string; proto: string } {
  const rawHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  // Keep the port (normalizeHost strips it) — localhost:3000 needs it in URLs.
  const hostWithPort = rawHost?.split(",")[0]?.trim().toLowerCase() ?? "";
  const host = normalizeHost(rawHost);
  const proto =
    request.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim() ||
    (isLoopbackHost(host) ? "http" : "https");
  return { host, hostWithPort: host ? hostWithPort : "", proto };
}

/** Public `https://host` for the incoming request (Vercel / proxies). */
export function publicSiteOriginFromRequest(request: Request): string {
  const { host, hostWithPort, proto } = requestHostParts(request);
  if (host) {
    return `${proto}://${hostWithPort}`;
  }
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (envUrl) return envUrl;
  return new URL(request.url).origin;
}

/**
 * Origin allowed for magic-link / OAuth callbacks: known brand hosts or loopback.
 * Preview (`*.vercel.app`) and unknown Host values are rejected.
 */
export function trustedAuthOriginFromRequest(request: Request): string | null {
  const { host, hostWithPort, proto } = requestHostParts(request);
  if (!host) return null;
  if (isLoopbackHost(host)) return `${proto}://${hostWithPort}`;
  if (ALL_BRAND_HOSTS.has(host)) {
    return `${proto}://${hostWithPort}`;
  }
  return null;
}
