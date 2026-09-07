import { normalizeHost } from "./resolve";

/** Public `https://host` for the incoming request (Vercel / proxies). */
export function publicSiteOriginFromRequest(request: Request): string {
  const rawHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  // Keep the port (normalizeHost strips it) — localhost:3000 needs it in URLs.
  const hostWithPort = rawHost?.split(",")[0]?.trim().toLowerCase() ?? "";
  const host = normalizeHost(rawHost) ? hostWithPort : "";
  const proto =
    request.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim() ||
    // Local dev has no x-forwarded-proto and no TLS — https://localhost breaks
    // OAuth redirects and magic-link URLs.
    (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  if (host) {
    return `${proto}://${host}`;
  }
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (envUrl) return envUrl;
  return new URL(request.url).origin;
}
