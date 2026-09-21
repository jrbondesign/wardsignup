import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getBrandFromHost } from "@/lib/brand";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";
import {
  isTipJarEnabled,
  resolveTipJarUrl,
  tipJarOutboundUrl,
} from "@/lib/tip-jar";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);
  const title = "Support the Project";
  const description = `${brand.shortName} is free to use and always will be. Optional contributions help offset hosting costs — never required.`;

  return {
    title,
    description,
    alternates: {
      canonical: "/support-the-project",
    },
    openGraph: {
      title,
      description,
      url: `${brand.siteUrl}/support-the-project`,
      siteName: brand.shortName,
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function SupportTheProjectPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);
  const tipEnabled = isTipJarEnabled(brand);
  const sponsorsUrl = tipJarOutboundUrl(brand, {
    utm_source: "support_page",
    utm_medium: "web",
    utm_campaign: "tip_jar",
  });

  return (
    <div className="min-h-screen bg-[#F4FAFB]">
      <MarketingNav />

      <main className="pt-[94px] pb-16 px-6">
        <article className="max-w-[720px] mx-auto">
          <h1 className="font-serif text-[clamp(36px,6vw,52px)] tracking-[-1px] text-[#0D2B35] mb-6 leading-[1.1]">
            Support the Project
          </h1>

          <section className="mb-10">
            <p className="text-[17px] leading-[1.7] text-[#2E5566] mb-4">
              Ward Signup is free to use — and always will be. No paid plan,
              no credit card wall, no ads on your signup sheets. Hosting, email
              delivery, and keeping wardsignup.com online is covered by the
              maintainers out of pocket. If Ward Signup has helped your ward
              coordinate scheduling, an optional contribution toward those costs is
              always welcome — and never required.
            </p>
          </section>

          {tipEnabled && sponsorsUrl && (
            <section className="mb-10">
              <h2 className="font-serif text-[28px] text-[#0D2B35] tracking-[-0.3px] mb-4 mt-8">
                Optional tip jar
              </h2>
              <p className="text-[17px] leading-[1.7] text-[#2E5566] mb-6">
                Contributions go through{" "}
                <a
                  href={resolveTipJarUrl(brand) ?? sponsorsUrl}
                  className="text-[#0E96B0] font-medium hover:text-[#08647E] transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub Sponsors
                </a>
                . Every amount helps; using Ward Signup without
                donating is completely fine.
              </p>
              <a
                href={sponsorsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-[15px] font-medium px-6 py-3 rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white no-underline shadow-[0_4px_14px_rgba(14,150,176,0.35)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_6px_20px_rgba(14,150,176,0.45)]"
              >
                Contribute via GitHub Sponsors →
              </a>
            </section>
          )}

          <section className="mb-10">
            <h2 className="font-serif text-[28px] text-[#0D2B35] tracking-[-0.3px] mb-4 mt-8">
              What your support covers
            </h2>
            <ul className="text-[17px] leading-[1.7] text-[#2E5566] list-disc pl-5 space-y-2">
              <li>Database and authentication hosting</li>
              <li>Transactional email (confirmations and organizer digests)</li>
              <li>Keeping wardsignup.com online and improving</li>
            </ul>
          </section>

          <section className="mb-10">
            <div className="bg-[#FFF8E1] border-l-4 border-[#F9A825] p-5 rounded-r-lg">
              <h2 className="font-serif text-[20px] text-[#0D2B35] tracking-[-0.3px] mb-3 mt-0">
                Not church tithing
              </h2>
              <p className="text-[16px] leading-[1.7] text-[#2E5566] mb-0">
                This tip jar supports the independent Ward Signup project only.
                It is <strong>not</strong> affiliated with The Church of Jesus Christ
                of Latter-day Saints and is not a substitute for tithing or
                other Church offerings. Use official Church channels for those.
              </p>
            </div>
          </section>

          <section className="mb-10">
            <h2 className="font-serif text-[28px] text-[#0D2B35] tracking-[-0.3px] mb-4 mt-8">
              Questions?
            </h2>
            <p className="text-[17px] leading-[1.7] text-[#2E5566] mb-4">
              Reach us at{" "}
              <a
                href={`mailto:${brand.supportEmail}`}
                className="text-[#0E96B0] font-medium hover:text-[#08647E] transition-colors"
              >
                {brand.supportEmail}
              </a>
              .
            </p>
            <p className="text-[17px] leading-[1.7] text-[#2E5566] mb-4">
              <Link
                href="/about"
                className="text-[#0E96B0] font-medium hover:text-[#08647E] transition-colors"
              >
                About
              </Link>
              {" · "}
              <Link
                href="/faq"
                className="text-[#0E96B0] font-medium hover:text-[#08647E] transition-colors"
              >
                FAQ
              </Link>
            </p>
          </section>
        </article>
      </main>

      <MarketingFooter />
    </div>
  );
}
