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
  const title = "Online signup sheets for ward secretaries | Ward Signup";
  const description = "Create time slots, set spot limits, and share one link. Built for Latter-day Saint ward secretaries — members sign up with no account. Free to use.";
  const url = `${brand.siteUrl}/use-cases/ward-secretary-signup`;
  
  return {
    metadataBase: new URL(brand.siteUrl),
    title,
    description,
    alternates: {
      canonical: "/use-cases/ward-secretary-signup",
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

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is an online ward signup sheet?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "An online ward signup sheet is a scheduling tool that lets ward secretaries publish available time slots (for example, tithing declaration appointments or interview windows), set capacity limits, and share one link. Members pick a slot, enter their name, and confirm — no account required. The secretary sees progress in real time and follows up only on gaps."
      }
    },
    {
      "@type": "Question",
      "name": "What should a ward secretary look for in a signup tool?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "A good ward signup tool must do three things: show clear slots with times or labels, cap how many people per slot so windows close when full, and be shareable without forcing members to create an account. Ward Signup is free to use, requires no training, and was built specifically for this workflow."
      }
    },
    {
      "@type": "Question",
      "name": "How fast can I replace a paper signup sheet?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Most ward secretaries have a signup link ready in under three minutes. Name the event, choose days and times (or labeled openings), set spot limits, copy the link, and share it in the bulletin, text, or email. No payment information, no setup wizard."
      }
    }
  ]
};

export default async function WardSecretarySignupPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);
  
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <div className="min-h-screen bg-[#F4FAFB]">
        <MarketingNav />
        
        <main className="pt-[88px] pb-16 px-6">
          <div className="max-w-[880px] mx-auto">
            <article className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-8 md:p-12">
              <h1 className="font-serif text-3xl md:text-[44px] leading-tight text-[#0D2B35] mb-5 tracking-[-0.5px]">
                Online signup sheets for ward secretaries
              </h1>
              
              <p className="text-[18px] text-[#2E5566] leading-[1.75] mb-10">
                A <strong>ward signup sheet</strong> is how executive secretaries and other leaders fill openings without phone tag: publish available times (or labeled openings), limit how many people can take each one, and share a single link. <strong>Ward Signup</strong> is that sheet online — time slots, spot limits, one link, no member accounts. Free to use.
              </p>

              <section className="mb-12">
                <h2 className="font-serif text-2xl text-[#0D2B35] mb-4">
                  What a ward secretary&apos;s signup sheet has to do
                </h2>
                <ul className="space-y-3 text-[17px] text-[#2E5566] leading-[1.7]">
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-[#0E96B0] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span>Open slots with clear times or short labels (for example "Nursery 2nd hour")</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-[#0E96B0] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span>Cap how many people per slot so windows close when full</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-[#0E96B0] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span>Be shareable in the bulletin, text, or email without forcing members to log in</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-[#0E96B0] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span>Show what is still open so you are not chasing confirmations blind</span>
                  </li>
                </ul>
              </section>

              <section className="mb-12">
                <h2 className="font-serif text-2xl text-[#0D2B35] mb-5">
                  How Ward Signup works
                </h2>
                
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[19px] font-semibold text-[#0D2B35] mb-2">
                      Create the sheet
                    </h3>
                    <p className="text-[17px] text-[#2E5566] leading-[1.7]">
                      Name the event, add a short description, set days and times (or labeled openings), and choose spot limits for each slot.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[19px] font-semibold text-[#0D2B35] mb-2">
                      Share one link
                    </h3>
                    <p className="text-[17px] text-[#2E5566] leading-[1.7]">
                      Copy the signup link. Put it in the bulletin, send it by text or email, or print a foyer QR. Optional email invites are fine when you want them — the sheet still works as a shared link.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[19px] font-semibold text-[#0D2B35] mb-2">
                      Members claim a spot
                    </h3>
                    <p className="text-[17px] text-[#2E5566] leading-[1.7]">
                      Members open the link on a phone or computer, pick an open spot, and enter their name. No account. No app.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[19px] font-semibold text-[#0D2B35] mb-2">
                      Track progress
                    </h3>
                    <p className="text-[17px] text-[#2E5566] leading-[1.7]">
                      See filled vs open at a glance, then follow up only on the gaps.
                    </p>
                  </div>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="font-serif text-2xl text-[#0D2B35] mb-4">
                  Common sheets secretaries run
                </h2>
                <ul className="space-y-3 text-[17px] text-[#2E5566] leading-[1.7]">
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-[#0E96B0] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span>
                      <Link href="/use-cases/tithing-declaration" className="text-[#0E96B0] hover:text-[#08647E] font-medium">
                        Tithing declaration appointments
                      </Link>
                      {" "}— bishop windows with household spot caps
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-[#0E96B0] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span>Temple recommend / youth and adult interviews — same slot-and-spots pattern</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-[#0E96B0] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span>Nursery coverage, teaching assignments, missionary dinners, service shifts, Fast Sunday sheets — timed shifts or labeled openings using the same sheet model</span>
                  </li>
                </ul>
                <p className="text-[17px] text-[#5A8399] mt-4 italic">
                  Ward Signup is a signup <strong>sheet</strong>, not a full ward operating system. Keep membership records and finances in official Church tools.
                </p>
              </section>

              <section className="mb-12">
                <h2 className="font-serif text-2xl text-[#0D2B35] mb-5">
                  Paper vs Google Forms vs SignUpGenius vs Ward Signup
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[15px]">
                    <thead>
                      <tr className="border-b-2 border-[#0E96B0]/20">
                        <th className="text-left py-3 px-4 font-semibold text-[#0D2B35]">Feature</th>
                        <th className="text-center py-3 px-4 font-semibold text-[#0D2B35]">Paper</th>
                        <th className="text-center py-3 px-4 font-semibold text-[#0D2B35]">Google Forms</th>
                        <th className="text-center py-3 px-4 font-semibold text-[#0D2B35]">
                          <Link href="/compare/signupgenius" className="text-[#0E96B0] hover:text-[#08647E]">
                            SignUpGenius
                          </Link>
                        </th>
                        <th className="text-center py-3 px-4 font-semibold text-[#0E96B0]">Ward Signup</th>
                      </tr>
                    </thead>
                    <tbody className="text-[#2E5566]">
                      <tr className="border-b border-[#0E96B0]/8">
                        <td className="py-3 px-4">Real-time slot tracking</td>
                        <td className="text-center py-3 px-4">❌</td>
                        <td className="text-center py-3 px-4">❌</td>
                        <td className="text-center py-3 px-4">✓</td>
                        <td className="text-center py-3 px-4 text-[#0E96B0]">✓</td>
                      </tr>
                      <tr className="border-b border-[#0E96B0]/8">
                        <td className="py-3 px-4">Auto-close when full</td>
                        <td className="text-center py-3 px-4">❌</td>
                        <td className="text-center py-3 px-4">❌</td>
                        <td className="text-center py-3 px-4">✓</td>
                        <td className="text-center py-3 px-4 text-[#0E96B0]">✓</td>
                      </tr>
                      <tr className="border-b border-[#0E96B0]/8">
                        <td className="py-3 px-4">No member account needed</td>
                        <td className="text-center py-3 px-4">✓</td>
                        <td className="text-center py-3 px-4">✓</td>
                        <td className="text-center py-3 px-4">✓</td>
                        <td className="text-center py-3 px-4 text-[#0E96B0]">✓</td>
                      </tr>
                      <tr className="border-b border-[#0E96B0]/8">
                        <td className="py-3 px-4">Built for ward schedules</td>
                        <td className="text-center py-3 px-4">✓</td>
                        <td className="text-center py-3 px-4">❌</td>
                        <td className="text-center py-3 px-4">❌</td>
                        <td className="text-center py-3 px-4 text-[#0E96B0]">✓</td>
                      </tr>
                      <tr className="border-b border-[#0E96B0]/8">
                        <td className="py-3 px-4">Free to use</td>
                        <td className="text-center py-3 px-4">✓</td>
                        <td className="text-center py-3 px-4">✓</td>
                        <td className="text-center py-3 px-4">Limited</td>
                        <td className="text-center py-3 px-4 text-[#0E96B0]">✓</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="mb-12 bg-[#E6F7FB] rounded-xl p-6 md:p-8">
                <h2 className="font-serif text-2xl text-[#0D2B35] mb-4">
                  Getting live before Sunday
                </h2>
                <ol className="space-y-3 text-[17px] text-[#2E5566] leading-[1.7]">
                  <li className="flex items-start gap-3">
                    <span className="font-semibold text-[#0E96B0] flex-shrink-0">1.</span>
                    <span>
                      <Link href="/create" className="text-[#0E96B0] hover:text-[#08647E] font-medium">
                        Create a signup sheet
                      </Link>
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="font-semibold text-[#0E96B0] flex-shrink-0">2.</span>
                    <span>Share the link by email, text, or bulletin</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="font-semibold text-[#0E96B0] flex-shrink-0">3.</span>
                    <span>Watch members sign up in real time</span>
                  </li>
                </ol>
              </section>

              <section className="mb-12">
                <h2 className="font-serif text-2xl text-[#0D2B35] mb-5">
                  Short answers
                </h2>
                
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[18px] font-semibold text-[#0D2B35] mb-2">
                      What is an online ward signup sheet?
                    </h3>
                    <p className="text-[16px] text-[#2E5566] leading-[1.7]">
                      An online ward signup sheet is a scheduling tool that lets ward secretaries publish available time slots (for example, tithing declaration appointments or interview windows), set capacity limits, and share one link. Members pick a slot, enter their name, and confirm — no account required. The secretary sees progress in real time and follows up only on gaps.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[18px] font-semibold text-[#0D2B35] mb-2">
                      What should a ward secretary look for in a signup tool?
                    </h3>
                    <p className="text-[16px] text-[#2E5566] leading-[1.7]">
                      A good ward signup tool must do three things: show clear slots with times or labels, cap how many people per slot so windows close when full, and be shareable without forcing members to create an account. Ward Signup is free to use, requires no training, and was built specifically for this workflow.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[18px] font-semibold text-[#0D2B35] mb-2">
                      How fast can I replace a paper signup sheet?
                    </h3>
                    <p className="text-[16px] text-[#2E5566] leading-[1.7]">
                      Most ward secretaries have a signup link ready in under three minutes. Name the event, choose days and times (or labeled openings), set spot limits, copy the link, and share it in the bulletin, text, or email. No payment information, no setup wizard.
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

              <section className="mt-10 text-center text-sm text-[#5A8399]">
                <p>
                  Also helpful:{" "}
                  <Link href="/use-cases/tithing-declaration" className="text-[#0E96B0] hover:text-[#08647E]">
                    Tithing Declaration
                  </Link>
                  {" · "}
                  <Link href="/compare/signupgenius" className="text-[#0E96B0] hover:text-[#08647E]">
                    vs SignUpGenius
                  </Link>
                  {" · "}
                  <Link href="/privacy" className="text-[#0E96B0] hover:text-[#08647E]">
                    Privacy
                  </Link>
                  {" · "}
                  <Link href="/terms" className="text-[#0E96B0] hover:text-[#08647E]">
                    Terms
                  </Link>
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
