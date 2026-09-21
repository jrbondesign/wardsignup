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
    title: `FAQ · ${brand.shortName}`,
    description: "Frequently asked questions about Ward Signup — free online signup sheets for Latter-day Saint wards and branches. Learn about time slots, spot limits, member access, and more.",
    alternates: {
      canonical: "/faq",
    },
    openGraph: {
      title: `FAQ · ${brand.shortName}`,
      description: "Frequently asked questions about Ward Signup — free online signup sheets for LDS wards.",
      url: `${brand.siteUrl}/faq`,
      siteName: brand.shortName,
      type: "website",
    },
  };
}

export default async function FAQPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Do members need an account to sign up?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No. Members click the link, pick a time slot, and enter their name. No account, no download, no login required."
        }
      },
      {
        "@type": "Question",
        "name": "Can I limit how many people sign up for each slot?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. Set how many spots each time slot has — when it's full, the slot closes automatically."
        }
      },
      {
        "@type": "Question",
        "name": "How much does Ward Signup cost?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Ward Signup is free to use. No credit card required. Optional contributions to offset hosting costs are welcome but never required — see /support-the-project."
        }
      },
      {
        "@type": "Question",
        "name": "Is Ward Signup official Church software?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No. Ward Signup is an independent product. It is not affiliated with or endorsed by The Church of Jesus Christ of Latter-day Saints. Use official Church systems for membership records, finances, and declaration status. Use Ward Signup only for appointment and signup logistics."
        }
      },
      {
        "@type": "Question",
        "name": "Can counselors, clerks, or other leaders help manage a signup?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. The organization owner can invite other leaders (for example counselors or clerks) as admins. Admins can edit events, manage signups, and view analytics. Only the owner can invite more admins, delete the organization or its events, rename the organization, or transfer ownership. Ward members signing up still need no account."
        }
      },
      {
        "@type": "Question",
        "name": "Does Ward Signup show ads or sell emails?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No. Ward Signup does not show commercial ads on signup sheets and does not sell, trade, or rent personal information to third parties (see the Privacy Policy). Members open a shared link, pick a slot, and enter their name (no account or app). Free to use."
        }
      }
    ]
  };

  return (
    <div className="min-h-screen bg-[#F4FAFB]">
      <MarketingNav />

      {/* Main Content */}
      <main className="pt-[94px] pb-16 px-6">
        <article className="max-w-[720px] mx-auto">
          <h1 className="font-serif text-[clamp(36px,6vw,52px)] tracking-[-1px] text-[#0D2B35] mb-6 leading-[1.1]">
            Frequently Asked Questions
          </h1>

          {/* Getting started */}
          <section className="mb-12">
            <h2 className="font-serif text-[28px] text-[#0D2B35] tracking-[-0.3px] mb-6 mt-10 pb-2 border-b-2 border-[#0E96B0]/15">
              Getting started
            </h2>

            <div className="space-y-8">
              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                  How do I create my first signup sheet?
                </h3>
                <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                  Click <strong>Get Started</strong>, sign in with your email, and follow the prompts. Name your event, add time slots with spot limits, and share the link. The whole process takes less than five minutes.
                </p>
              </div>

              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                  What's the difference between a time slot and a spot?
                </h3>
                <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                  A <strong>time slot</strong> is a specific day and time (like "Tuesday, March 5 at 6:00 PM"). <strong>Spots</strong> are how many people can sign up for that slot. For example, a slot might have 3 spots, meaning 3 people can claim that time.
                </p>
              </div>

              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                  Can I edit the event after I share the link?
                </h3>
                <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                  Yes. You can update the event as plans change; share the same link again for big schedule changes.
                </p>
              </div>

              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                  Can counselors, clerks, or other leaders help manage a signup?
                </h3>
                <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                  Yes. The organization owner can invite other leaders (for example counselors or clerks) as admins. Admins can edit events, manage signups, and view analytics. Only the owner can invite more admins, delete the organization or its events, rename the organization, or transfer ownership. Ward members signing up still need no account.
                </p>
              </div>
            </div>
          </section>

          {/* For members */}
          <section className="mb-12">
            <h2 className="font-serif text-[28px] text-[#0D2B35] tracking-[-0.3px] mb-6 mt-10 pb-2 border-b-2 border-[#0E96B0]/15">
              For members
            </h2>

            <div className="space-y-8">
              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                  Do members need an account to sign up?
                </h3>
                <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                  <strong>No.</strong> Members click the link, pick a time slot, and enter their name. No account, no download, no login required.
                </p>
              </div>

              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                  What if a member picks the wrong time?
                </h3>
                <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                  Members can cancel their own signup using the link in their confirmation email. As the organizer, you can also remove or move signups from your dashboard.
                </p>
              </div>

              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                  Will members get a reminder?
                </h3>
                <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                  Yes. If a member provides their email when signing up, they'll automatically receive a reminder email 24 hours before their appointment.
                </p>
              </div>
            </div>
          </section>

          {/* Slots and limits */}
          <section className="mb-12">
            <h2 className="font-serif text-[28px] text-[#0D2B35] tracking-[-0.3px] mb-6 mt-10 pb-2 border-b-2 border-[#0E96B0]/15">
              Slots and limits
            </h2>

            <div className="space-y-8">
              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                  Can I limit how many people sign up for each slot?
                </h3>
                <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                  <strong>Yes.</strong> Set how many spots each time slot has — when it's full, the slot closes automatically.
                </p>
              </div>

              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                  What happens when a time slot fills up?
                </h3>
                <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                  The slot becomes unavailable. Members see it grayed out and can't select it. They can still pick from any open slots.
                </p>
              </div>

              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                  Can I add more slots after I share the link?
                </h3>
                <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                  Yes. Go to your dashboard, open the event, and add more slots. The same link still works — members will see the updated options.
                </p>
              </div>
            </div>
          </section>

          {/* Cost and trust */}
          <section className="mb-12">
            <h2 className="font-serif text-[28px] text-[#0D2B35] tracking-[-0.3px] mb-6 mt-10 pb-2 border-b-2 border-[#0E96B0]/15">
              Cost and trust
            </h2>

            <div className="space-y-8">
              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                  How much does Ward Signup cost?
                </h3>
                <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                  Ward Signup is <strong>free to use</strong>. No credit card required.
                  Optional contributions to offset hosting costs are welcome but never required — see{" "}
                  <Link href="/support-the-project" className="text-[#0E96B0] font-medium hover:text-[#08647E] transition-colors">
                    Support the Project
                  </Link>
                  .
                </p>
              </div>

              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                  Is Ward Signup official Church software?
                </h3>
                <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                  <strong>No.</strong> Ward Signup is an independent product. It is <strong>not</strong> affiliated with or endorsed by The Church of Jesus Christ of Latter-day Saints. Use official Church systems for membership records, finances, and declaration status. Use Ward Signup only for appointment and signup logistics.
                </p>
              </div>

              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                  Does Ward Signup show ads or sell emails?
                </h3>
                <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                  No. Ward Signup does not show commercial ads on signup sheets and does not sell, trade, or rent personal information to third parties (see the Privacy Policy). Members open a shared link, pick a slot, and enter their name (no account or app). Free to use. More:{" "}
                  <Link href="/ad-free" className="text-[#0E96B0] font-medium hover:text-[#08647E] transition-colors">
                    Ad free ward signup sheets
                  </Link>
                  .
                </p>
              </div>

              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                  How is member data protected?
                </h3>
                <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                  We collect only the minimum data needed (name, optional email/phone). Signups are visible only to the organizer who created the event. See our <Link href="/privacy" className="text-[#0E96B0] font-medium hover:text-[#08647E] transition-colors">Privacy Policy</Link> for details.
                </p>
              </div>
            </div>
          </section>

          {/* Common ward uses */}
          <section className="mb-12">
            <h2 className="font-serif text-[28px] text-[#0D2B35] tracking-[-0.3px] mb-6 mt-10 pb-2 border-b-2 border-[#0E96B0]/15">
              Common ward uses
            </h2>

            <div className="space-y-8">
              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                  Can I use this for tithing declaration appointments?
                </h3>
                <p className="text-[17px] leading-[1.7] text-[#2E5566] mb-3">
                  Yes. Ward Signup is commonly used for tithing settlement scheduling. Create 15-minute slots, set one spot per slot, and share the link with your ward. Members pick a time without back-and-forth texts or calls.
                </p>
                <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                  See our <Link href="/use-cases/tithing-declaration" className="text-[#0E96B0] font-medium hover:text-[#08647E] transition-colors">tithing declaration guide</Link> for a complete walkthrough.
                </p>
              </div>

              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                  What other ward activities work well?
                </h3>
                <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                  Youth and adult interviews, temple recommend appointments, service project shifts, missionary dinners, teaching assignments, and nursery volunteer schedules are all common use cases.
                </p>
              </div>
            </div>
          </section>

          {/* Help */}
          <section className="mb-12">
            <h2 className="font-serif text-[28px] text-[#0D2B35] tracking-[-0.3px] mb-6 mt-10 pb-2 border-b-2 border-[#0E96B0]/15">
              Help
            </h2>

            <div className="space-y-8">
              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                  I have a question that isn't answered here. How do I get help?
                </h3>
                <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                  Email us at <a href={`mailto:${brand.supportEmail}`} className="text-[#0E96B0] font-medium hover:text-[#08647E] transition-colors">{brand.supportEmail}</a>. We typically respond within one business day.
                </p>
              </div>

              <div>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">
                  Can I suggest a feature?
                </h3>
                <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                  Yes! Send your feedback to <a href={`mailto:${brand.supportEmail}`} className="text-[#0E96B0] font-medium hover:text-[#08647E] transition-colors">{brand.supportEmail}</a>. We're actively building based on what wards need.
                </p>
              </div>
            </div>
          </section>

          {/* Related Resources */}
          <div className="mt-12 pt-8 border-t border-[#0E96B0]/10">
            <p className="text-sm text-[#5A8399] mb-3">Related resources:</p>
            <div className="space-y-2 text-sm">
              <div>
                <Link href="/use-cases/tithing-declaration" className="text-[#0E96B0] hover:text-[#08647E] underline">
                  Tithing Declaration Scheduling
                </Link>
                {" "}— step-by-step guide
              </div>
              <div>
                <Link href="/compare/signupgenius" className="text-[#0E96B0] hover:text-[#08647E] underline">
                  Ward Signup vs SignUpGenius
                </Link>
                {" "}— comparison for wards
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-14 p-8 bg-gradient-to-br from-[#22C8D8]/10 via-[#0E96B0]/10 to-[#08647E]/10 rounded-2xl border border-[#0E96B0]/20 text-center">
            <h2 className="font-serif text-[24px] text-[#0D2B35] mb-3">
              Ready to get started?
            </h2>
            <p className="text-[16px] text-[#5A8399] mb-6 max-w-[480px] mx-auto">
              Create your first signup sheet in under five minutes. Free to use.
            </p>
            <Link 
              href="/create" 
              className="inline-flex items-center gap-2 text-[15px] font-semibold px-6 py-3 rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white border-none no-underline shadow-[0_4px_14px_rgba(14,150,176,0.35)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_6px_20px_rgba(14,150,176,0.45)]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Create Event
            </Link>
          </div>

          {/* FAQPage Schema */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
          />
        </article>
      </main>

      <MarketingFooter />
    </div>
  );
}
