import type { Metadata } from "next";
import { headers } from "next/headers";
import { getBrandFromHost } from "@/lib/brand";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);
  const title = `Sign in — ${brand.shortName}`;
  const description = `Sign in to ${brand.name} to manage your events and signups.`;
  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    },
    alternates: {
      canonical: "/login",
    },
    openGraph: {
      title,
      description,
      url: `${brand.siteUrl}/login`,
      siteName: brand.shortName,
      type: "website",
    },
  };
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
