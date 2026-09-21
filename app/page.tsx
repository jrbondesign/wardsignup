import type { Metadata } from "next";
import { headers } from "next/headers";
import HomePage from "@/components/HomePage";
import { getBrandFromHost } from "@/lib/brand";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);

  return {
    title: brand.metadataTitle,
    description: brand.metadataDescription,
    alternates: {
      canonical: "/",
    },
    openGraph: {
      title: brand.shortName,
      description: brand.metadataDescription,
      url: brand.siteUrl,
      siteName: brand.shortName,
      type: "website",
    },
  };
}

export default function Page() {
  return <HomePage />;
}
