import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getBrandFromHost } from "@/lib/brand";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);

  return {
    title: `Tithing Declaration Appointments · ${brand.shortName}`,
    description: "Schedule tithing settlement online with Ward Signup. Create 15-minute appointment slots, set capacity, and share one link. Members pick a time with no account needed.",
    alternates: {
      canonical: "/use-cases/tithing-declaration",
    },
    openGraph: {
      title: `Tithing Declaration Appointments · ${brand.shortName}`,
      description: "Schedule tithing settlement online — create slots, share one link, members sign up with no account.",
      url: `${brand.siteUrl}/use-cases/tithing-declaration`,
      siteName: brand.shortName,
      type: "website",
    },
  };
}

export default async function TithingDeclarationPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Do ward members need an account to schedule their tithing settlement appointment?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No. Members click the link, pick an available time slot, and enter their name. No account creation, no download, no login required."
        }
      },
      {
        "@type": "Question",
        "name": "Can I limit how many appointments are scheduled per time slot?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. Set one spot per 15-minute slot to prevent double-booking. When a slot is claimed, it automatically becomes unavailable for others."
        }
      },
      {
        "@type": "Question",
        "name": "Is Ward Signup official Church software for tithing settlement?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No. Ward Signup is an independent product not affiliated with or endorsed by The Church of Jesus Christ of Latter-day Saints. Use it only for appointment scheduling logistics, not for tracking declaration status or financial records. Use official Church systems for those purposes."
        }
      }
    ]
  };

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": "How to Schedule Tithing Declaration Appointments Online",
    "description": "Step-by-step guide to scheduling tithing settlement appointments for your ward using Ward Signup.",
    "step": [
      {
        "@type": "HowToStep",
        "name": "Create your event",
        "text": "Sign in to Ward Signup, click Create Event, and name it 'Tithing Settlement 2026' or similar."
      },
      {
        "@type": "HowToStep",
        "name": "Add time slots",
        "text": "Create 15-minute appointment slots across multiple days. Set each slot to 1 spot to prevent double-booking."
      },
      {
        "@type": "HowToStep",
        "name": "Share the link",
        "text": "Copy your unique signup link and share it via email, text, or ward bulletin. Members can sign up immediately."
      },
      {
        "@type": "HowToStep",
        "name": "Track appointments",
        "text": "View all scheduled appointments in your dashboard. Members automatically receive confirmation and reminder emails."
      }
    ]
  };

  return (
    <div className="min-h-screen bg-[#F4FAFB]">
      <MarketingNav />

      {/* Hero */}
      <section className="pt-[104px] pb-16 px-6 bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] relative overflow-hidden">
        <div className="absolute inset-0 z-[1] pointer-events-none" style={{
          background: `radial-gradient(ellipse at 18% 28%, rgba(255,255,255,0.20) 0%, transparent 52%),
                       radial-gradient(ellipse at 80% 75%, rgba(5,79,100,0.45) 0%, transparent 55%)`
        }}/>
        
        <div className="relative z-[2] max-w-[760px] mx-auto text-center">
          <h1 className="font-serif text-[clamp(38px,7vw,56px)] tracking-[-1.2px] text-white mb-5 leading-[1.1]">
            Schedule tithing declaration appointments online
          </h1>
          <p className="text-[clamp(17px,2.4vw,20px)] text-white/85 mb-8 max-w-[560px] mx-auto leading-[1.6]">
            Create 15-minute slots, share one link, and let ward members pick their own time — no paper signup sheets, no back-and-forth texts.
          </p>
          <div className="flex gap-3 flex-wrap justify-center">
            <Link href="/create" className="text-base font-semibold px-8 py-3.5 rounded-full bg-white text-[#08647E] border-none no-underline shadow-[0_8px_28px_rgba(0,0,0,0.20)] transition-all duration-200 inline-flex items-center gap-2 hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(0,0,0,0.25)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#0E96B0" }}>
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Create Your Schedule
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-[88px] px-6 bg-white">
        <div className="max-w-[860px] mx-auto">
          <h2 className="font-serif text-[clamp(28px,4vw,40px)] text-center tracking-[-0.6px] text-[#0D2B35] mb-3 leading-[1.15]">
            How it works
          </h2>
          <p className="text-[17px] text-[#5A8399] text-center max-w-[500px] mx-auto mb-14 leading-[1.65]">
            Set up tithing settlement scheduling in under 10 minutes
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-[#E6F7FB] flex items-center justify-center flex-shrink-0 mt-1">
                <span className="font-serif text-[18px] text-[#0E96B0]">1</span>
              </div>
              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-2">
                  Create your event
                </h3>
                <p className="text-[16px] text-[#5A8399] leading-[1.7]">
                  Sign in to Ward Signup, click <strong>Create Event</strong>, and name it "Tithing Settlement 2026" or similar.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-[#E6F7FB] flex items-center justify-center flex-shrink-0 mt-1">
                <span className="font-serif text-[18px] text-[#0E96B0]">2</span>
              </div>
              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-2">
                  Add time slots
                </h3>
                <p className="text-[16px] text-[#5A8399] leading-[1.7]">
                  Create 15-minute appointment slots across multiple days. Set each slot to <strong>1 spot</strong> to prevent double-booking.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-[#E6F7FB] flex items-center justify-center flex-shrink-0 mt-1">
                <span className="font-serif text-[18px] text-[#0E96B0]">3</span>
              </div>
              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-2">
                  Share the link
                </h3>
                <p className="text-[16px] text-[#5A8399] leading-[1.7]">
                  Copy your unique signup link and share it via email, text, or ward bulletin. Members can sign up immediately.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-[#E6F7FB] flex items-center justify-center flex-shrink-0 mt-1">
                <span className="font-serif text-[18px] text-[#0E96B0]">4</span>
              </div>
              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-2">
                  Track appointments
                </h3>
                <p className="text-[16px] text-[#5A8399] leading-[1.7]">
                  View all scheduled appointments in your dashboard. Members automatically receive confirmation and reminder emails.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Compare Table */}
      <section className="py-[88px] px-6 bg-[#F4FAFB]">
        <div className="max-w-[860px] mx-auto">
          <h2 className="font-serif text-[clamp(28px,4vw,40px)] text-center tracking-[-0.6px] text-[#0D2B35] mb-3 leading-[1.15]">
            Paper sheets vs. Ward Signup
          </h2>
          <p className="text-[17px] text-[#5A8399] text-center max-w-[500px] mx-auto mb-12 leading-[1.65]">
            What changes when you move tithing settlement scheduling online
          </p>

          <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(8,100,126,0.10)] overflow-hidden border border-[#0E96B0]/10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
              {/* Header Row */}
              <div className="hidden md:block p-5 bg-[#054F64]/5"></div>
              <div className="p-5 bg-[#054F64]/5 border-b border-[#0E96B0]/10">
                <div className="font-serif text-[16px] text-[#5A8399] text-center">Paper sheet</div>
              </div>
              <div className="p-5 bg-[#E6F7FB] border-b border-[#0E96B0]/10">
                <div className="font-serif text-[16px] text-[#0E96B0] font-semibold text-center">Ward Signup</div>
              </div>

              {/* Rows */}
              {[
                { feature: "Members need an account", paper: "No", digital: "No" },
                { feature: "Real-time availability", paper: "No — paper gets outdated", digital: "Yes — updates instantly" },
                { feature: "Double-booking risk", paper: "High — manual tracking", digital: "Zero — slots close when full" },
                { feature: "Confirmation emails", paper: "No", digital: "Yes — automatic" },
                { feature: "Reminder emails", paper: "No", digital: "Yes — 24 hours before" },
                { feature: "Accessible from anywhere", paper: "No — foyer only", digital: "Yes — share one link" },
                { feature: "Setup time", paper: "Print, post, hope people see it", digital: "10 minutes to live" },
              ].map((row, i) => (
                <div key={i} className="contents">
                  <div className="p-5 border-b border-[#0E96B0]/5 font-medium text-[14px] text-[#0D2B35] flex items-center">
                    {row.feature}
                  </div>
                  <div className="p-5 border-b border-[#0E96B0]/5 text-[14px] text-[#5A8399] text-center flex items-center justify-center">
                    {row.paper}
                  </div>
                  <div className="p-5 border-b border-[#0E96B0]/5 bg-[#E6F7FB]/30 text-[14px] text-[#0E96B0] font-medium text-center flex items-center justify-center">
                    {row.digital}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-[#0E96B0]/10 text-center">
            <p className="text-[15px] text-[#5A8399]">
              Prefer SignUpGenius today? See a calm comparison:{" "}
              <Link href="/compare/signupgenius" className="text-[#0E96B0] hover:text-[#08647E] underline">
                Ward Signup vs SignUpGenius
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* Case Study Section */}
      <section className="py-[88px] px-6 bg-white">
        <div className="max-w-[860px] mx-auto">
          <h2 className="font-serif text-[clamp(28px,4vw,40px)] tracking-[-0.6px] text-[#0D2B35] mb-3 leading-[1.15]">
            How one ward ran it
          </h2>
          <p className="text-sm text-[#0E96B0] mb-8 italic">
            A real Arizona ward path from ChatGPT discovery to a shared signup sheet.
          </p>

          <div className="prose prose-slate max-w-none">
            <p className="text-[17px] text-[#2E5566] leading-[1.75] mb-5">
              In fall 2026, a leader in an Arizona ward asked ChatGPT how to schedule tithing declaration appointments. The answer pointed them to Ward Signup. They opened the product, created tithing-declaration events with the bishop&rsquo;s available windows and spot limits, and shared a flyer (and the signup link) with the ward.
            </p>

            <p className="text-[17px] text-[#2E5566] leading-[1.75] mb-5">
              Members booked times with no account. As slots filled, the ward could see what was still open without chasing a paper sheet on the office door. Another leader was invited as an admin so more than one person could help manage the same signup.
            </p>

            <p className="text-[17px] text-[#2E5566] leading-[1.75]">
              That path — discover in ChatGPT → create the declaration events → share a flyer or link → run signups → <Link href="/faq" className="text-[#0E96B0] hover:underline">invite a co-admin</Link> — is the same workflow this page describes.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-[88px] px-6 bg-[#F4FAFB]">
        <div className="max-w-[720px] mx-auto">
          <h2 className="font-serif text-[clamp(28px,4vw,40px)] text-center tracking-[-0.6px] text-[#0D2B35] mb-12 leading-[1.15]">
            Common questions
          </h2>

          <div className="space-y-8">
            <div>
              <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                Do ward members need an account to schedule their tithing settlement appointment?
              </h3>
              <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                <strong>No.</strong> Members click the link, pick an available time slot, and enter their name. No account creation, no download, no login required.
              </p>
            </div>

            <div>
              <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                Can I limit how many appointments are scheduled per time slot?
              </h3>
              <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                <strong>Yes.</strong> Set one spot per 15-minute slot to prevent double-booking. When a slot is claimed, it automatically becomes unavailable for others.
              </p>
            </div>

            <div>
              <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                Is Ward Signup official Church software for tithing settlement?
              </h3>
              <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                <strong>No.</strong> Ward Signup is an independent product not affiliated with or endorsed by The Church of Jesus Christ of Latter-day Saints. Use it only for appointment scheduling logistics, not for tracking declaration status or financial records. Use official Church systems for those purposes.
              </p>
            </div>
          </div>

          <div className="mt-12 text-center">
            <p className="text-[16px] text-[#5A8399] mb-4">More questions?</p>
            <Link href="/faq" className="text-[#0E96B0] font-medium hover:text-[#08647E] transition-colors">
              See our full FAQ →
            </Link>
          </div>

          <div className="mt-10 pt-8 border-t border-[#0E96B0]/10 text-sm text-[#5A8399]">
            <p className="mb-2">Related:</p>
            <Link href="/compare/signupgenius" className="text-[#0E96B0] hover:text-[#08647E] underline">
              Ward Signup vs SignUpGenius
            </Link>
          </div>
        </div>
      </section>

      {/* Church Independence Notice */}
      <section className="py-[88px] px-6 bg-[#F4FAFB]">
        <div className="max-w-[760px] mx-auto">
          <div className="bg-[#FFF8E1] border-l-4 border-[#F9A825] p-8 rounded-r-lg">
            <h2 className="font-serif text-[24px] text-[#0D2B35] tracking-[-0.3px] mb-4 mt-0">
              Independent of the Church
            </h2>
            <p className="text-[17px] leading-[1.7] text-[#2E5566] mb-0">
              Ward Signup is an <strong>independent</strong> product. It is <strong>not</strong> official Church software and is <strong>not</strong> affiliated with or endorsed by The Church of Jesus Christ of Latter-day Saints. Use official Church systems for membership records, finances, and declaration status. Use Ward Signup only for appointment and signup logistics.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-[88px] px-6 bg-white">
        <div className="max-w-[660px] mx-auto text-center">
          <h2 className="font-serif text-[clamp(26px,4vw,36px)] text-[#0D2B35] tracking-[-0.5px] mb-4 leading-[1.15]">
            Ready to simplify tithing settlement scheduling?
          </h2>
          <p className="text-[17px] text-[#5A8399] mb-8 max-w-[480px] mx-auto leading-[1.6]">
            Free to use. Create your schedule in under 10 minutes.
          </p>
          <Link href="/create" className="inline-flex items-center gap-2 text-base font-semibold px-8 py-3.5 rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white border-none no-underline shadow-[0_8px_28px_rgba(14,150,176,0.35)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_12px_36px_rgba(14,150,176,0.45)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Get Started
          </Link>
        </div>
      </section>

      {/* Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
      />

      <MarketingFooter />
    </div>
  );
}
