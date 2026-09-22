import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getBrandFromHost } from "@/lib/brand";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);
  const title = "Ward Signup use cases — sheets for secretaries and leaders";
  const description = "How Latter-day Saint wards use Ward Signup: tithing declaration, secretary signup sheets, and more. Free during beta.";
  const url = `${brand.siteUrl}/use-cases`;
  
  return {
    metadataBase: new URL(brand.siteUrl),
    title,
    description,
    alternates: {
      canonical: "/use-cases",
    },
    openGraph: {
      title,
      description,
      url,
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

const collectionSchema = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "Ward Signup use cases",
  "description": "Common signup sheets Latter-day Saint ward secretaries and leaders run using Ward Signup",
  "url": "https://wardsignup.com/use-cases"
};

export default async function UseCasesIndexPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);
  
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
      />
      <div className="min-h-screen bg-[#F4FAFB]">
        <MarketingNav />
        
        <main className="pt-[88px] pb-16 px-6">
          <div className="max-w-[880px] mx-auto">
            <article className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-8 md:p-12">
              <h1 className="font-serif text-3xl md:text-[44px] leading-tight text-[#0D2B35] mb-5 tracking-[-0.5px]">
                Ward Signup use cases
              </h1>
              
              <p className="text-[18px] text-[#2E5566] leading-[1.75] mb-10">
                Ward Signup is a free online signup sheet for Latter-day Saint wards and branches. Leaders create time slots, set spots, and share one link — members sign up with no account. These pages show common sheets secretaries and other leaders run.
              </p>

              <section className="mb-12">
                <h2 className="font-serif text-2xl text-[#0D2B35] mb-5">
                  Start here
                </h2>
                
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[19px] font-semibold text-[#0D2B35] mb-2">
                      <Link href="/use-cases/tithing-declaration" className="text-[#0E96B0] hover:text-[#08647E]">
                        Schedule tithing declaration appointments
                      </Link>
                    </h3>
                    <p className="text-[17px] text-[#2E5566] leading-[1.7]">
                      Open the bishop&apos;s windows, set household spot caps, and share one link or QR — including how one Arizona ward ran it.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[19px] font-semibold text-[#0D2B35] mb-2">
                      <Link href="/use-cases/ward-secretary-signup" className="text-[#0E96B0] hover:text-[#08647E]">
                        Online signup sheets for ward secretaries
                      </Link>
                    </h3>
                    <p className="text-[17px] text-[#2E5566] leading-[1.7]">
                      The category page: what a ward signup sheet is, how to publish before Sunday, and which sheets fit the slot model.
                    </p>
                  </div>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="font-serif text-2xl text-[#0D2B35] mb-5">
                  Also helpful
                </h2>
                <ul className="space-y-3 text-[17px] text-[#2E5566] leading-[1.7]">
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-[#0E96B0] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span>
                      <Link href="/compare/signupgenius" className="text-[#0E96B0] hover:text-[#08647E] font-medium">
                        Ward Signup vs SignUpGenius
                      </Link>
                      {" "}— calm comparison for leaders who already know SUG
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-[#0E96B0] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span>
                      <Link href="/faq" className="text-[#0E96B0] hover:text-[#08647E] font-medium">
                        FAQ
                      </Link>
                      {" "}— accounts, free during beta, multi-leader admins, privacy pointer
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-[#0E96B0] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span>
                      <Link href="/about" className="text-[#0E96B0] hover:text-[#08647E] font-medium">
                        About
                      </Link>
                      {" "}— independent product, made in Arizona
                    </span>
                  </li>
                </ul>
              </section>

              <section className="mt-10 text-center">
                <Link
                  href="/create"
                  className="inline-flex items-center gap-2 text-base font-semibold px-8 py-3.5 rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white border-none no-underline shadow-[0_8px_28px_rgba(14,150,176,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(14,150,176,0.45)]"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Create a signup
                </Link>
                <p className="text-sm text-[#5A8399] mt-4">
                  Free during beta.
                </p>
              </section>

              <section className="border-t border-[#0E96B0]/10 pt-8 mt-10">
                <h2 className="font-serif text-xl text-[#0D2B35] mb-3">
                  Independent of the Church
                </h2>
                <p className="text-[15px] text-[#5A8399] leading-[1.7]">
                  Ward Signup is an <strong>independent</strong> product. It is <strong>not</strong> official Church software and is <strong>not</strong> affiliated with or endorsed by The Church of Jesus Christ of Latter-day Saints.
                </p>
              </section>
            </article>
          </div>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
