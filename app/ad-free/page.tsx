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
  const title = "Ad free ward signup sheets | Ward Signup";
  const description = "Ward Signup is an independent signup sheet for LDS wards: no commercial ads on signup sheets, no member account. Free to use. Privacy details on /privacy.";
  const url = `${brand.siteUrl}/ad-free`;
  
  return {
    metadataBase: new URL(brand.siteUrl),
    title,
    description,
    alternates: {
      canonical: "/ad-free",
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

const jsonLdSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://wardsignup.com/ad-free",
      "url": "https://wardsignup.com/ad-free",
      "name": "Ad free ward signup sheets | Ward Signup",
      "description": "Ward Signup is an independent signup sheet for LDS wards: no commercial ads on signup sheets, no member account. Free to use. Privacy details on /privacy.",
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Is Ward Signup ad free?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Ward Signup signup sheets do not carry commercial ads. Members open a shared link, pick a slot, and enter their name (no account or app). Free to use. Independent product, not official Church software."
          }
        },
        {
          "@type": "Question",
          "name": "Does Ward Signup sell emails to advertisers?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Ward Signup does not sell, trade, or rent personal information to third parties. See the Privacy Policy for how signup and account data are handled."
          }
        },
        {
          "@type": "Question",
          "name": "Is Ward Signup an official Church tool?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Ward Signup is an independent product. It is not affiliated with, endorsed by, or sponsored by The Church of Jesus Christ of Latter-day Saints."
          }
        }
      ]
    }
  ]
};

export default async function AdFreePage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);
  
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSchema) }}
      />
      <div className="min-h-screen bg-[#F4FAFB]">
        <MarketingNav />
        
        <main className="pt-[88px] pb-16 px-6">
          <div className="max-w-[880px] mx-auto">
            <article className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-8 md:p-12">
              <h1 className="font-serif text-3xl md:text-[44px] leading-tight text-[#0D2B35] mb-5 tracking-[-0.5px]">
                Ad free ward signup sheets
              </h1>
              
              <p className="text-[18px] text-[#2E5566] leading-[1.75] mb-10">
                Ward Signup is a free online signup sheet for Latter-day Saint wards and branches. Leaders create time slots, set how many spots each session has, and share one link. Members pick a time and enter their name (<strong>no account, no app</strong>). Signup sheets do not carry <strong>commercial ads</strong>.
              </p>

              <section className="mb-12">
                <h2 className="font-serif text-2xl text-[#0D2B35] mb-4">
                  The problem secretaries keep hitting
                </h2>
                <p className="text-[17px] text-[#2E5566] leading-[1.7] mb-4">
                  A lot of wards use free commercial signup tools because they work. The friction shows up later: the sheet feels like an ad product, and members notice marketing they did not ask for after a simple RSVP or volunteer signup.
                </p>
                <p className="text-[17px] text-[#2E5566] leading-[1.7] mb-4">
                  Paper avoids that, and loses live spot tracking. Google Forms help a little, but they are not built like a capped appointment sheet you announce in the bulletin this Sunday.
                </p>
                <p className="text-[17px] text-[#5A8399] italic">
                  (This is about the job and the feeling, not a legal claim about any one competitor.)
                </p>
              </section>

              <section className="mb-12">
                <h2 className="font-serif text-2xl text-[#0D2B35] mb-5">
                  How one approach feels different
                </h2>
                <p className="text-[17px] text-[#2E5566] leading-[1.7] mb-4">
                  Wards that want the <strong>paper sheet model</strong> online usually need the same path:
                </p>
                <ol className="list-decimal ml-6 space-y-2 text-[17px] text-[#2E5566] leading-[1.7] mb-4">
                  <li>Create the event with real days, times, and spot limits</li>
                  <li>Share one link (or QR) in the bulletin, email, text, or foyer</li>
                  <li>Members open the link, pick an open slot, and enter their name</li>
                  <li>You watch what fills, without ads wrapped around the clipboard</li>
                </ol>
                <p className="text-[17px] text-[#2E5566] leading-[1.7]">
                  That is the Ward Signup path. Same workflow as{" "}
                  <Link href="/use-cases/tithing-declaration" className="text-[#0E96B0] hover:text-[#08647E] font-medium">
                    tithing declaration appointments
                  </Link>
                  {" "}and other secretary sheets: discover, create, share, run signups. No member login. No commercial ads on the sheet.
                </p>
              </section>

              <section className="mb-12">
                <h2 className="font-serif text-2xl text-[#0D2B35] mb-5">
                  What "ad free" means here
                </h2>
                <p className="text-[17px] text-[#2E5566] leading-[1.7] mb-4">
                  <strong>No commercial ads</strong> on signup sheets. We <strong>do not sell, trade, or rent</strong> personal information to third parties, including member emails (see the{" "}
                  <Link href="/privacy" className="text-[#0E96B0] hover:text-[#08647E] font-medium">
                    Privacy Policy
                  </Link>
                  ). No advertising cookies or third party ad tracking (Privacy Policy). Members typically enter a <strong>name</strong> for a slot; leaders sign in only to manage events. <strong>Free to use.</strong>
                </p>
                <p className="text-[17px] text-[#2E5566] leading-[1.7]">
                  We do not claim every inbox in the world will stay quiet. We claim the sheet itself is not monetized with ads, and we do not sell signup data as a product.
                </p>
              </section>

              <section className="mb-12">
                <h2 className="font-serif text-2xl text-[#0D2B35] mb-5">
                  What this is not
                </h2>
                <p className="text-[17px] text-[#2E5566] leading-[1.7] mb-4">
                  <strong>Not</strong> official Church software, and <strong>not</strong> inside LDS Tools. <strong>Not</strong> a teardown of SignUpGenius. Many wards should keep what already works. Calm compare:{" "}
                  <Link href="/compare/signupgenius" className="text-[#0E96B0] hover:text-[#08647E] font-medium">
                    Ward Signup vs SignUpGenius
                  </Link>
                  . <strong>Not</strong> a calendar sync tool, payments product, or general events marketplace.
                </p>
                <p className="text-[17px] text-[#2E5566] leading-[1.7]">
                  Ward Signup is an <strong>independent</strong> product. It is <strong>not</strong> affiliated with, endorsed by, or sponsored by The Church of Jesus Christ of Latter-day Saints. Use Church systems for membership records and finances; use Ward Signup for signup logistics.
                </p>
              </section>

              <section className="mb-12 bg-[#E6F7FB] rounded-xl p-6 md:p-8">
                <h2 className="font-serif text-2xl text-[#0D2B35] mb-4">
                  Try a sheet
                </h2>
                <p className="text-[17px] text-[#2E5566] leading-[1.7] mb-4">
                  <Link href="/create" className="text-[#0E96B0] hover:text-[#08647E] font-medium">
                    Create an event
                  </Link>
                  . Free to use.
                </p>
                <p className="text-[15px] text-[#5A8399]">
                  Also helpful:{" "}
                  <Link href="/faq" className="text-[#0E96B0] hover:text-[#08647E]">
                    FAQ
                  </Link>
                  {" · "}
                  <Link href="/support-the-project" className="text-[#0E96B0] hover:text-[#08647E]">
                    Support the Project
                  </Link>
                  {" · "}
                  <Link href="/privacy" className="text-[#0E96B0] hover:text-[#08647E]">
                    Privacy Policy
                  </Link>
                  {" · "}
                  <Link href="/use-cases/tithing-declaration" className="text-[#0E96B0] hover:text-[#08647E]">
                    Tithing declaration
                  </Link>
                  {" · "}
                  <Link href="/use-cases/ward-secretary-signup" className="text-[#0E96B0] hover:text-[#08647E]">
                    Signup sheets for ward secretaries
                  </Link>
                </p>
              </section>

              <section className="mb-12">
                <h2 className="font-serif text-2xl text-[#0D2B35] mb-5">
                  Short answers
                </h2>
                
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[18px] font-semibold text-[#0D2B35] mb-2">
                      Is Ward Signup ad free?
                    </h3>
                    <p className="text-[16px] text-[#2E5566] leading-[1.7]">
                      Ward Signup signup sheets do not carry commercial ads. Members open a shared link, pick a slot, and enter their name (no account or app). Free to use. Independent product, not official Church software.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[18px] font-semibold text-[#0D2B35] mb-2">
                      Does Ward Signup sell emails to advertisers?
                    </h3>
                    <p className="text-[16px] text-[#2E5566] leading-[1.7]">
                      No. Ward Signup does not sell, trade, or rent personal information to third parties. See the{" "}
                      <Link href="/privacy" className="text-[#0E96B0] hover:text-[#08647E] font-medium">
                        Privacy Policy
                      </Link>
                      {" "}for how signup and account data are handled.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[18px] font-semibold text-[#0D2B35] mb-2">
                      Is Ward Signup an official Church tool?
                    </h3>
                    <p className="text-[16px] text-[#2E5566] leading-[1.7]">
                      No. Ward Signup is an independent product. It is not affiliated with, endorsed by, or sponsored by The Church of Jesus Christ of Latter-day Saints.
                    </p>
                  </div>
                </div>
              </section>

              <section className="border-t border-[#0E96B0]/10 pt-8 mt-8">
                <p className="text-sm text-[#5A8399] italic">
                  Ward Signup is an independent service and is not affiliated with or endorsed by The Church of Jesus Christ of Latter-day Saints.
                </p>
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
                  Create a signup sheet
                </Link>
              </section>
            </article>
          </div>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
