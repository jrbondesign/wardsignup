import type { Metadata } from "next";
import { DM_Serif_Display, DM_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { headers } from "next/headers";
import { Suspense } from "react";
import { BrandProvider } from "@/components/BrandProvider";
import { BrandJsonLd } from "@/components/BrandJsonLd";
import { PostHogProvider } from "@/components/PostHogProvider";
import { PostHogPageView } from "@/components/PostHogPageView";
import { getBrandFromHost } from "@/lib/brand";
import "./globals.css";

const dmSerifDisplay = DM_Serif_Display({
  weight: ["400"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-dm-serif",
  display: "swap",
});

const dmSans = DM_Sans({
  weight: ["300", "400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);
  const base = new URL(brand.siteUrl);

  // Future: Ministry/Org support
  const isMinistry = false;

  // GSC HTML-tag verification (preferred tonight — no DNS wait).
  // Set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION to the token from Search Console.
  const googleSiteVerification =
    process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim() || undefined;

  return {
    metadataBase: base,
    title: brand.metadataTitle,
    description: brand.metadataDescription,
    icons: {
      icon: [
        {
          url: isMinistry ? "/ministry-favicon-32.png" : "/wardsignup-favicon-32.png",
          type: "image/png",
          sizes: "32x32",
        },
      ],
      apple: [
        {
          url: isMinistry ? "/ministry-apple-180.png" : "/wardsignup-apple-180.png",
          type: "image/png",
          sizes: "180x180",
        },
      ],
    },
    openGraph: {
      title: brand.shortName,
      description: brand.metadataDescription,
      url: brand.siteUrl,
      siteName: brand.shortName,
      images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: brand.shortName,
      description: brand.twitterDescription,
      images: ["/opengraph-image"],
    },
    ...(googleSiteVerification
      ? { verification: { google: googleSiteVerification } }
      : {}),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);

  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${dmSerifDisplay.variable} antialiased`}>
        <BrandJsonLd brand={brand} />
        <PostHogProvider>
          <BrandProvider brand={brand}>
            {children}
            <Suspense><PostHogPageView /></Suspense>
          </BrandProvider>
        </PostHogProvider>
        <Analytics />
      </body>
    </html>
  );
}
