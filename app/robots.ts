import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getBrandFromHost } from "@/lib/brand";

/**
 * Public crawler policy: allow marketing pages; keep auth/app surfaces out of
 * discovery. Pair with per-route `robots: { index: false }` on those layouts.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/login",
          "/create",
          "/dashboard",
          "/settings",
          "/edit",
          "/admin",
          "/admin-utils",
          "/orgs",
          "/auth",
          "/api/",
        ],
      },
    ],
    sitemap: `${brand.siteUrl}/sitemap.xml`,
    host: brand.siteHost,
  };
}
