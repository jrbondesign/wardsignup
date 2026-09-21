import type { PublicBrand } from "@/lib/brand";

/**
 * Basic schema.org graph from existing brand copy only.
 * No FAQPage (no FAQ on-site). No legal entity name/street address invented.
 */
export function BrandJsonLd({ brand }: { brand: PublicBrand }) {
  const orgId = `${brand.siteUrl}/#organization`;
  const websiteId = `${brand.siteUrl}/#website`;
  const appId = `${brand.siteUrl}/#app`;

  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": orgId,
        name: brand.name,
        url: brand.siteUrl,
        email: brand.supportEmail,
        logo: `${brand.siteUrl}${brand.logoSrc}`,
      },
      {
        "@type": "WebSite",
        "@id": websiteId,
        name: brand.name,
        url: brand.siteUrl,
        description: brand.metadataDescription,
        publisher: { "@id": orgId },
        inLanguage: "en-US",
      },
      {
        "@type": "WebApplication",
        "@id": appId,
        name: brand.name,
        url: brand.siteUrl,
        description: brand.metadataDescription,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "Free to use",
        },
        publisher: { "@id": orgId },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
