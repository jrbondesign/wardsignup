import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getBrandFromHost } from "@/lib/brand";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";
import { isTipJarEnabled } from "@/lib/tip-jar";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);

  return {
    title: `About · ${brand.shortName}`,
    description: `${brand.shortName} is an independent free online signup sheet for Latter-day Saint wards and branches. Create time slots, set spots, and share one link — members sign up with no account.`,
    alternates: {
      canonical: "/about",
    },
    openGraph: {
      title: `About · ${brand.shortName}`,
      description: `${brand.shortName} is an independent free online signup sheet for Latter-day Saint wards and branches.`,
      url: `${brand.siteUrl}/about`,
      siteName: brand.shortName,
      type: "website",
    },
  };
}

export default async function AboutPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);
  const tipEnabled = isTipJarEnabled(brand);

  return (
    <div className="min-h-screen bg-[#F4FAFB]">
      <MarketingNav />

      {/* Main Content */}
      <main className="pt-[94px] pb-16 px-6">
        <article className="max-w-[720px] mx-auto">
          <h1 className="font-serif text-[clamp(36px,6vw,52px)] tracking-[-1px] text-[#0D2B35] mb-6 leading-[1.1]">
            About Ward Signup
          </h1>

          {/* What Ward Signup is */}
          <section className="mb-10">
            <h2 className="font-serif text-[28px] text-[#0D2B35] tracking-[-0.3px] mb-4 mt-8">
              What Ward Signup is
            </h2>
            <div className="prose prose-lg max-w-none">
              <p className="text-[17px] leading-[1.7] text-[#2E5566] mb-4">
                Ward Signup is a free online signup sheet for Latter-day Saint wards and branches. Leaders create time slots, set how many spots each session has, and share one link — members pick a time and enter their name without creating an account or downloading an app.
              </p>
              <p className="text-[17px] leading-[1.7] text-[#2E5566] mb-4">
                It is built for the people who already run paper sheets and bulletin announcements: ward and branch executive secretaries, clerks, and other callings that need capped appointment windows or volunteer openings filled before Sunday.
              </p>
            </div>
          </section>

          {/* Independence Notice */}
          <section className="mb-10">
            <div className="bg-[#FFF8E1] border-l-4 border-[#F9A825] p-5 rounded-r-lg">
              <h2 className="font-serif text-[20px] text-[#0D2B35] tracking-[-0.3px] mb-3 mt-0">
                Independent of the Church
              </h2>
              <p className="text-[16px] leading-[1.7] text-[#2E5566] mb-0">
                Ward Signup is an <strong>independent</strong> product. It is <strong>not</strong> official Church software and is <strong>not</strong> affiliated with or endorsed by The Church of Jesus Christ of Latter-day Saints. Use official Church systems for membership records, finances, and declaration status. Use Ward Signup only for appointment and signup logistics.
              </p>
            </div>
          </section>

          {/* Who built it */}
          <section className="mb-10">
            <h2 className="font-serif text-[28px] text-[#0D2B35] tracking-[-0.3px] mb-4 mt-8">
              Who built it
            </h2>
            <p className="text-[17px] leading-[1.7] text-[#2E5566] mb-4">
              Ward Signup is made by <strong>Jonathan Bond (maker)</strong>. Built with ward secretary workflows in mind, not as a generic school or PTA signup clone.
            </p>
          </section>

          {/* Where & how to reach us */}
          <section className="mb-10">
            <h2 className="font-serif text-[28px] text-[#0D2B35] tracking-[-0.3px] mb-4 mt-8">
              Where &amp; how to reach us
            </h2>
            <p className="text-[17px] leading-[1.7] text-[#2E5566] mb-4">
              Made with care from <strong>Arizona</strong>. Questions or feedback: <a href={`mailto:${brand.supportEmail}`} className="text-[#0E96B0] font-medium hover:text-[#08647E] transition-colors">{brand.supportEmail}</a>.
            </p>
          </section>

          {/* Pricing */}
          <section className="mb-10">
            <h2 className="font-serif text-[28px] text-[#0D2B35] tracking-[-0.3px] mb-4 mt-8">
              Pricing
            </h2>
            <p className="text-[17px] leading-[1.7] text-[#2E5566] mb-4">
              Ward Signup is <strong>free to use</strong>. No credit card required — and there is no paid plan.
            </p>
            {tipEnabled && (
              <p className="text-[17px] leading-[1.7] text-[#2E5566] mb-4">
                If it has helped your ward and you want to chip in toward hosting costs, optional support is welcome:{" "}
                <Link href="/support-the-project" className="text-[#0E96B0] font-medium hover:text-[#08647E] transition-colors">
                  Support the Project
                </Link>
                .
              </p>
            )}
          </section>

          {/* Explore */}
          <section className="mb-10">
            <h2 className="font-serif text-[28px] text-[#0D2B35] tracking-[-0.3px] mb-4 mt-8">
              Explore
            </h2>
            <div className="flex gap-4 flex-wrap">
              <Link 
                href="/faq" 
                className="inline-flex items-center gap-2 text-[15px] font-medium px-5 py-2.5 rounded-full bg-white border-[1.5px] border-[#0E96B0]/40 text-[#08647E] no-underline transition-all duration-200 hover:border-[#0E96B0] hover:bg-[#E6F7FB]"
              >
                FAQ
              </Link>
              <Link 
                href="/ad-free" 
                className="inline-flex items-center gap-2 text-[15px] font-medium px-5 py-2.5 rounded-full bg-white border-[1.5px] border-[#0E96B0]/40 text-[#08647E] no-underline transition-all duration-200 hover:border-[#0E96B0] hover:bg-[#E6F7FB]"
              >
                Ad free sheets and privacy
              </Link>
              {tipEnabled && (
                <Link 
                  href="/support-the-project" 
                  className="inline-flex items-center gap-2 text-[15px] font-medium px-5 py-2.5 rounded-full bg-white border-[1.5px] border-[#0E96B0]/40 text-[#08647E] no-underline transition-all duration-200 hover:border-[#0E96B0] hover:bg-[#E6F7FB]"
                >
                  Support the Project
                </Link>
              )}
              <Link 
                href="/create" 
                className="inline-flex items-center gap-2 text-[15px] font-medium px-5 py-2.5 rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white border-none no-underline shadow-[0_4px_14px_rgba(14,150,176,0.35)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_6px_20px_rgba(14,150,176,0.45)]"
              >
                Create
              </Link>
            </div>
          </section>

          {/* Schema.org Organization markup */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Organization",
                "name": "Ward Signup",
                "url": brand.siteUrl,
                "email": brand.supportEmail,
                "description": "Free online signup sheet for Latter-day Saint wards and branches",
              })
            }}
          />
        </article>
      </main>

      {/* Footer */}
      <MarketingFooter />
    </div>
  );
}
