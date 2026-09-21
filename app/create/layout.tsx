import type { Metadata } from "next";
import { headers } from "next/headers";
import { getBrandFromHost } from "@/lib/brand";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);
  const title = `Create event — ${brand.shortName}`;
  const description = `Create a signup event in ${brand.name}.`;
  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    },
  };
}

export default function CreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
