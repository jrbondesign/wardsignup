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
  const title = "Ward Signup vs Calendly for ward appointment sheets";
  const description = "A fair look at Calendly and Ward Signup for Latter-day Saint ward logistics — calendar sync vs a capped signup sheet.";
  const url = `${brand.siteUrl}/compare/calendly`;
  
  return {
    metadataBase: new URL(brand.siteUrl),
    title,
    description,
    alternates: {
      canonical: "/compare/calendly",
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

export default async function CompareCalendly() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${brand.siteUrl}/compare/calendly`,
        "url": `${brand.siteUrl}/compare/calendly`,
        "name": "Ward Signup vs Calendly for ward appointment sheets",
        "description": "A fair look at Calendly and Ward Signup for Latter-day Saint ward logistics — calendar sync vs a capped signup sheet.",
        "isPartOf": {
          "@type": "WebSite",
          "url": brand.siteUrl,
          "name": brand.shortName,
        },
      },
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "Is Ward Signup a Calendly alternative for wards?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "It can be an alternative when the job is a capped signup sheet you publish and share like a bulletin announcement. It is not a Calendly replacement when you need personal calendar sync for one host.",
            },
          },
          {
            "@type": "Question",
            "name": "When should a ward use Calendly instead?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Use Calendly when availability should come from a leader's real calendar and bookings are mostly 1:1. Use Ward Signup when you need spots-per-slot and a shared sheet many members can open with no account.",
            },
          },
          {
            "@type": "Question",
            "name": "Can we use both?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. Many wards keep Calendly for calendar-owned interviews and use Ward Signup for declaration-style sheets and volunteer shifts.",
            },
          },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="min-h-screen bg-[#F4FAFB]">
        <MarketingNav />

        {/* Main Content */}
        <main className="pt-[94px] pb-16 px-6">
          <article className="max-w-4xl mx-auto">
          <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-8 md:p-12">
            <h1 className="font-serif text-3xl md:text-4xl text-[#0D2B35] mb-6 leading-tight">
              Ward Signup vs Calendly for ward appointment sheets
            </h1>

            <div className="prose prose-lg max-w-none text-[#2E5566] space-y-6">
              <p>
                Calendly is excellent when one person's calendar should drive availability. Many wards use it that way for a bishop's interview grid. <strong>Ward Signup</strong> is a different tool: a <strong>signup sheet</strong> with time slots, spot limits, and one shareable link — closer to the paper on the office door than to a personal calendar sync.
              </p>

              <p>
                This is a calm comparison, not a teardown. Both can be good.
              </p>

              <p>
                <strong>Ward Signup</strong> is a free online signup sheet for Latter-day Saint wards and branches. Leaders create time slots, set spots, and share one link. Members pick a time and enter their name — no account. Free during beta.
              </p>

              <h2 className="font-serif text-2xl text-[#0D2B35] mt-10 mb-4">
                What job are you hiring for?
              </h2>

              <div className="overflow-x-auto -mx-4 md:mx-0">
                <table className="min-w-full border-collapse border border-[#0E96B0]/20">
                  <thead>
                    <tr className="bg-[#E6F7FB]">
                      <th className="border border-[#0E96B0]/20 px-4 py-3 text-left font-semibold text-[#0D2B35]">Job</th>
                      <th className="border border-[#0E96B0]/20 px-4 py-3 text-left font-semibold text-[#0D2B35]">Better mental match</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Sync one leader's personal calendar and book 1:1s against real free/busy</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3"><strong>Calendly</strong></td>
                    </tr>
                    <tr className="bg-[#F4FAFB]">
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Publish a ward sheet of capped windows anyone can claim from a bulletin link</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3"><strong>Ward Signup</strong></td>
                    </tr>
                    <tr>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Mix of both</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Use Calendly for true calendar-owned 1:1s; use Ward Signup for declaration-style sheets and multi-spot shifts</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h2 className="font-serif text-2xl text-[#0D2B35] mt-10 mb-4">
                A fair side-by-side
              </h2>

              <div className="overflow-x-auto -mx-4 md:mx-0">
                <table className="min-w-full border-collapse border border-[#0E96B0]/20">
                  <thead>
                    <tr className="bg-[#E6F7FB]">
                      <th className="border border-[#0E96B0]/20 px-4 py-3 text-left font-semibold text-[#0D2B35]"></th>
                      <th className="border border-[#0E96B0]/20 px-4 py-3 text-left font-semibold text-[#0D2B35]">Ward Signup</th>
                      <th className="border border-[#0E96B0]/20 px-4 py-3 text-left font-semibold text-[#0D2B35]">Calendly</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-[#0E96B0]/20 px-4 py-3 font-medium">Model</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Signup sheet: slots + spots + link</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Personal/host calendar booking</td>
                    </tr>
                    <tr className="bg-[#F4FAFB]">
                      <td className="border border-[#0E96B0]/20 px-4 py-3 font-medium">Member account</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Not required</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Invitee usually books without organizing an account; host connects a calendar</td>
                    </tr>
                    <tr>
                      <td className="border border-[#0E96B0]/20 px-4 py-3 font-medium">Spot caps / multi-person slots</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Built around spots per session</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Strong for 1:1; multi-spot sheet workflows are not its main job</td>
                    </tr>
                    <tr className="bg-[#F4FAFB]">
                      <td className="border border-[#0E96B0]/20 px-4 py-3 font-medium">Ward bulletin / QR sheet feel</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Designed for that announce pattern</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Possible, but the product story is calendar booking</td>
                    </tr>
                    <tr>
                      <td className="border border-[#0E96B0]/20 px-4 py-3 font-medium">Pricing (on this site)</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Free during beta</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">
                        See{" "}
                        <a
                          href="https://calendly.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#0E96B0] hover:text-[#08647E] underline"
                        >
                          Calendly's site
                        </a>
                        {" "}for current plans — we do not invent competitor pricing
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h2 className="font-serif text-2xl text-[#0D2B35] mt-10 mb-4">
                Choose Ward Signup if…
              </h2>

              <ul className="list-disc ml-6 space-y-2">
                <li>You want a <strong>paper-sheet replacement</strong> for tithing declaration, nursery shifts, or similar capped openings</li>
                <li>Members should book from one link <strong>without</strong> tying the sheet to one person's Google/Outlook free/busy</li>
                <li>You care most about spot limits and a secretary-style progress view</li>
              </ul>

              <p className="bg-[#E6F7FB] border-l-4 border-[#0E96B0] p-4 rounded">
                See:{" "}
                <Link href="/use-cases/tithing-declaration" className="font-medium text-[#0E96B0] hover:text-[#08647E] underline">
                  tithing declaration guide
                </Link>
                {" "}·{" "}
                <Link href="/use-cases/ward-secretary-signup" className="font-medium text-[#0E96B0] hover:text-[#08647E] underline">
                  secretary signup sheets
                </Link>
              </p>

              <h2 className="font-serif text-2xl text-[#0D2B35] mt-10 mb-4">
                Keep Calendly if…
              </h2>

              <ul className="list-disc ml-6 space-y-2">
                <li>The bishop (or one leader) should own availability from a live calendar</li>
                <li>You need deep calendar sync, buffers, and round-robin style host scheduling Calendly is known for</li>
                <li>Your workflow is truly 1:1 booking, not a multi-spot foyer sheet</li>
              </ul>

              <h2 className="font-serif text-2xl text-[#0D2B35] mt-10 mb-4">
                Ward Signup vs SignUpGenius vs Calendly (one line)
              </h2>

              <p>
                SignUpGenius is a broad signup toolkit; Calendly is calendar booking; Ward Signup is the ward <strong>sheet</strong> model. Deeper SUG compare:{" "}
                <Link href="/compare/signupgenius" className="text-[#0E96B0] hover:text-[#08647E] underline">
                  Ward Signup vs SignUpGenius
                </Link>
                .
              </p>

              <h2 className="font-serif text-2xl text-[#0D2B35] mt-10 mb-4">
                Short answers
              </h2>

              <div className="space-y-6">
                <div className="border-l-4 border-[#22C8D8] pl-6 py-2">
                  <h3 className="font-semibold text-lg text-[#0D2B35] mb-2">
                    Is Ward Signup a Calendly alternative for wards?
                  </h3>
                  <p>
                    It can be an alternative when the job is a capped signup sheet you publish and share like a bulletin announcement. It is not a Calendly replacement when you need personal calendar sync for one host.
                  </p>
                </div>

                <div className="border-l-4 border-[#22C8D8] pl-6 py-2">
                  <h3 className="font-semibold text-lg text-[#0D2B35] mb-2">
                    When should a ward use Calendly instead?
                  </h3>
                  <p>
                    Use Calendly when availability should come from a leader's real calendar and bookings are mostly 1:1. Use Ward Signup when you need spots-per-slot and a shared sheet many members can open with no account.
                  </p>
                </div>

                <div className="border-l-4 border-[#22C8D8] pl-6 py-2">
                  <h3 className="font-semibold text-lg text-[#0D2B35] mb-2">
                    Can we use both?
                  </h3>
                  <p>
                    Yes. Many wards keep Calendly for calendar-owned interviews and use Ward Signup for declaration-style sheets and volunteer shifts.
                  </p>
                </div>
              </div>

              <h2 className="font-serif text-2xl text-[#0D2B35] mt-10 mb-4">
                Independent of the Church
              </h2>

              <p className="text-sm text-[#5A8399] bg-[#F4FAFB] p-4 rounded">
                Ward Signup is an <strong>independent</strong> product. It is <strong>not</strong> official Church software and is <strong>not</strong> affiliated with or endorsed by The Church of Jesus Christ of Latter-day Saints.
              </p>

              <div className="flex flex-wrap gap-4 mt-8">
                <Link
                  href="/create"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white font-semibold rounded-full shadow-[0_4px_14px_rgba(14,150,176,0.35)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_6px_20px_rgba(14,150,176,0.45)] no-underline"
                >
                  Create a signup sheet
                </Link>
              </div>

              <p className="text-[15px] text-[#5A8399] mt-6">
                Also helpful:{" "}
                <Link href="/use-cases/tithing-declaration" className="text-[#0E96B0] hover:text-[#08647E] underline">
                  Tithing declaration
                </Link>
                {" "}·{" "}
                <Link href="/compare/signupgenius" className="text-[#0E96B0] hover:text-[#08647E] underline">
                  vs SignUpGenius
                </Link>
                {" "}·{" "}
                <Link href="/faq" className="text-[#0E96B0] hover:text-[#08647E] underline">
                  FAQ
                </Link>
              </p>
            </div>
          </div>
        </article>
      </main>
      <MarketingFooter />
    </div>
    </>
  );
}
