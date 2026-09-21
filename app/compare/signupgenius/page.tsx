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
  const title = "Ward Signup vs SignUpGenius for ward signup sheets";
  const description = "A fair look at Ward Signup and SignUpGenius for Latter-day Saint ward appointments — when a simple sheet fits, when to stay put, and how tithing declaration works online.";
  const url = `${brand.siteUrl}/compare/signupgenius`;
  
  return {
    metadataBase: new URL(brand.siteUrl),
    title,
    description,
    alternates: {
      canonical: "/compare/signupgenius",
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

export default async function CompareSignUpGenius() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${brand.siteUrl}/compare/signupgenius`,
        "url": `${brand.siteUrl}/compare/signupgenius`,
        "name": "Ward Signup vs SignUpGenius for ward signup sheets",
        "description": "A fair look at Ward Signup and SignUpGenius for Latter-day Saint ward appointments — when a simple sheet fits, when to stay put, and how tithing declaration works online.",
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
            "name": "What is a good SignUpGenius alternative for an LDS ward?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Ward Signup is a simple option for Latter-day Saint wards and branches that need online signup sheets: leaders create time slots, set spots per session, and share one link. Members claim a spot with their name — no account or app — which fits executive secretary workflows like tithing declaration, interviews, and volunteer shifts. Ward Signup is free to use.",
            },
          },
          {
            "@type": "Question",
            "name": "How is Ward Signup different from SignUpGenius?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "SignUpGenius is a broad signup platform used by many kinds of groups. Ward Signup is focused on the ward signup-sheet model — time slots, spot limits, shareable links, and no member logins — with language and examples aimed at ward secretaries and bishopric callings. If you need a wide general-purpose signup toolkit, SignUpGenius may still fit. If you want a paper-sheet replacement for ward appointments, Ward Signup is built for that job.",
            },
          },
          {
            "@type": "Question",
            "name": "When should a ward keep SignUpGenius?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Keep SignUpGenius if it already fits how your ward runs and you rely on workflows outside Ward Signup's scope. Consider Ward Signup when the job is mainly a capped appointment or volunteer sheet you want to publish and share like a bulletin announcement. For one-person calendar sync, Calendly is often the better match than either sheet-style tool.",
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
              Ward Signup vs SignUpGenius for ward signup sheets
            </h1>

            <div className="prose prose-lg max-w-none text-[#2E5566] space-y-6">
              <p>
                SignUpGenius is a familiar tool for a lot of wards. Many executive secretaries have used it for years for activities, meals, and appointment sheets. This page is a calm comparison for leaders who are asking whether a <strong>simpler ward signup sheet</strong> might fit a job like tithing declaration — not a teardown, and not a claim that one product is "best for everyone."
              </p>

              <p>
                <strong>Ward Signup</strong> is a free online signup sheet for Latter-day Saint wards and branches. Leaders create time slots, set how many spots each session has, and share one link. Members pick a time and enter their name — no account, no app. Free to use.
              </p>

              <h2 className="font-serif text-2xl text-[#0D2B35] mt-10 mb-4">
                What ward leaders usually need
              </h2>

              <p>
                For bishop-office and calling logistics, the job is usually narrow:
              </p>

              <ul className="list-disc ml-6 space-y-2">
                <li>Clear days and times with <strong>capped spots</strong> so a window closes when it is full</li>
                <li>A link (or QR) that members can open without creating an account</li>
                <li>Something you can announce in the bulletin, email, or foyer this Sunday</li>
                <li>A live view of what is still open so you only follow up on gaps</li>
              </ul>

              <p>
                If that sounds like the paper sheet on the office door — just online — that is the model Ward Signup is built around.
              </p>

              <h2 className="font-serif text-2xl text-[#0D2B35] mt-10 mb-4">
                A fair side-by-side
              </h2>

              <div className="overflow-x-auto -mx-4 md:mx-0">
                <table className="min-w-full border-collapse border border-[#0E96B0]/20">
                  <thead>
                    <tr className="bg-[#E6F7FB]">
                      <th className="border border-[#0E96B0]/20 px-4 py-3 text-left font-semibold text-[#0D2B35]"></th>
                      <th className="border border-[#0E96B0]/20 px-4 py-3 text-left font-semibold text-[#0D2B35]">Ward Signup</th>
                      <th className="border border-[#0E96B0]/20 px-4 py-3 text-left font-semibold text-[#0D2B35]">SignUpGenius</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-[#0E96B0]/20 px-4 py-3 font-medium">Built around</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Ward and branch signup sheets (appointments, callings, simple shifts)</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">General group signups used by many kinds of organizations</td>
                    </tr>
                    <tr className="bg-[#F4FAFB]">
                      <td className="border border-[#0E96B0]/20 px-4 py-3 font-medium">Member account</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Not required — name on a shared link</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Often usable without a member login; organizer setup varies by how you use it</td>
                    </tr>
                    <tr>
                      <td className="border border-[#0E96B0]/20 px-4 py-3 font-medium">Core model</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Time slots, spots per session, one shareable link</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Flexible signup formats and a broad set of organizer workflows</td>
                    </tr>
                    <tr className="bg-[#F4FAFB]">
                      <td className="border border-[#0E96B0]/20 px-4 py-3 font-medium">Language / examples</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Wards, branches, secretary-style appointment sheets</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Generic organizer language across many use cases</td>
                    </tr>
                    <tr>
                      <td className="border border-[#0E96B0]/20 px-4 py-3 font-medium">Pricing (on this site)</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">Free to use</td>
                      <td className="border border-[#0E96B0]/20 px-4 py-3">
                        See{" "}
                        <a
                          href="https://www.signupgenius.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#0E96B0] hover:text-[#08647E] underline"
                        >
                          SignUpGenius
                        </a>
                        {" "}for their current plans — we do not invent competitor pricing here
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p>
                SignUpGenius has earned its place as a default for many groups. Ward Signup is narrower on purpose: the sheet model for ward logistics.
              </p>

              <h2 className="font-serif text-2xl text-[#0D2B35] mt-10 mb-4">
                Choose Ward Signup if…
              </h2>

              <ul className="list-disc ml-6 space-y-2">
                <li>You want the <strong>paper-sheet model</strong> online for ward appointments and callings</li>
                <li>You care most about <strong>no member login</strong>, spot limits, and publishing a link quickly</li>
                <li>Your near-term jobs look like tithing declaration, interviews, nursery coverage, Fast Sunday sheets, or similar capped windows</li>
              </ul>

              <p className="bg-[#E6F7FB] border-l-4 border-[#0E96B0] p-4 rounded">
                Start here:{" "}
                <Link href="/use-cases/tithing-declaration" className="font-medium text-[#0E96B0] hover:text-[#08647E] underline">
                  Schedule tithing declaration appointments
                </Link>
              </p>

              <h2 className="font-serif text-2xl text-[#0D2B35] mt-10 mb-4">
                Keep SignUpGenius (or use Calendly) if…
              </h2>

              <ul className="list-disc ml-6 space-y-2">
                <li>Your ward already depends on SignUpGenius workflows or features outside what Ward Signup offers today — staying put can be the calm choice</li>
                <li>You need a large, general-purpose signup toolkit for many non-ward contexts in one account</li>
                <li>You specifically need <strong>personal calendar sync</strong> for one leader's availability — many wards use <strong>Calendly</strong> for that job. Ward Signup is a <strong>sheet</strong> tool (slots + spots + link), not a calendar-sync product</li>
              </ul>

              <p>
                Both can be good tools. The question is which mental model matches this Sunday's sheet.
              </p>

              <h2 className="font-serif text-2xl text-[#0D2B35] mt-10 mb-4">
                Ads and member friction
              </h2>

              <p>
                Many free commercial signup tools work fine for schools and clubs, and some wards are happy with them. A recurring concern in LDS tech conversations is ad supported free tiers and marketing that follows a simple signup. Ward Signup takes a narrower path: a ward signup sheet with <strong>no commercial ads on the sheet</strong>, no member account, and a published Privacy Policy that says we do not sell, trade, or rent personal information. Details:{" "}
                <Link href="/ad-free" className="text-[#0E96B0] hover:text-[#08647E] underline">
                  Ad free ward signup sheets
                </Link>
                . That will not replace every SignUpGenius workflow, and it is not a Church tool, but it matches the "paper sheet online without the ad product" job a lot of executive secretaries describe.
              </p>

              <h2 className="font-serif text-2xl text-[#0D2B35] mt-10 mb-4">
                Moving a ward sheet without drama
              </h2>

              <p>
                You do not need a dramatic "migration project."
              </p>

              <ol className="list-decimal ml-6 space-y-2">
                <li>Create the next event in Ward Signup (for example <strong>Tithing Declaration 2026</strong>) with the real windows and spot limits.</li>
                <li>Announce the same way you already do: bulletin, email, text, or foyer QR.</li>
                <li>Recreate slots for the next season when it opens — there is no one-click import from other tools claimed here.</li>
              </ol>

              <p className="mt-4 text-[15px] text-[#5A8399]">
                See also:{" "}
                <Link href="/use-cases/tithing-declaration" className="text-[#0E96B0] hover:text-[#08647E] underline">
                  tithing declaration guide
                </Link>
                {" "}·{" "}
                <Link href="/faq" className="text-[#0E96B0] hover:text-[#08647E] underline">
                  FAQ
                </Link>
              </p>

              <h2 className="font-serif text-2xl text-[#0D2B35] mt-10 mb-4">
                Short answers
              </h2>

              <div className="space-y-6">
                <div className="border-l-4 border-[#22C8D8] pl-6 py-2">
                  <h3 className="font-semibold text-lg text-[#0D2B35] mb-2">
                    What is a good SignUpGenius alternative for an LDS ward?
                  </h3>
                  <p>
                    Ward Signup is a simple option for Latter-day Saint wards and branches that need online signup sheets: leaders create time slots, set spots per session, and share one link. Members claim a spot with their name — no account or app — which fits executive secretary workflows like tithing declaration, interviews, and volunteer shifts. Ward Signup is free to use.
                  </p>
                </div>

                <div className="border-l-4 border-[#22C8D8] pl-6 py-2">
                  <h3 className="font-semibold text-lg text-[#0D2B35] mb-2">
                    How is Ward Signup different from SignUpGenius?
                  </h3>
                  <p>
                    SignUpGenius is a broad signup platform used by many kinds of groups. Ward Signup is focused on the ward signup-sheet model — time slots, spot limits, shareable links, and no member logins — with language and examples aimed at ward secretaries and bishopric callings. If you need a wide general-purpose signup toolkit, SignUpGenius may still fit. If you want a paper-sheet replacement for ward appointments, Ward Signup is built for that job.
                  </p>
                </div>

                <div className="border-l-4 border-[#22C8D8] pl-6 py-2">
                  <h3 className="font-semibold text-lg text-[#0D2B35] mb-2">
                    When should a ward keep SignUpGenius?
                  </h3>
                  <p>
                    Keep SignUpGenius if it already fits how your ward runs and you rely on workflows outside Ward Signup's scope. Consider Ward Signup when the job is mainly a capped appointment or volunteer sheet you want to publish and share like a bulletin announcement. For one-person calendar sync, Calendly is often the better match than either sheet-style tool.
                  </p>
                </div>
              </div>

              <h2 className="font-serif text-2xl text-[#0D2B35] mt-10 mb-4">
                Independent of the Church
              </h2>

              <p className="text-sm text-[#5A8399] bg-[#F4FAFB] p-4 rounded">
                Ward Signup is an independent service created to help Latter-day Saint wards and branches coordinate their scheduling needs. This service is not affiliated with, endorsed by, or sponsored by The Church of Jesus Christ of Latter-day Saints.
              </p>

              <p className="text-[15px] text-[#5A8399] mt-6">
                Also helpful:{" "}
                <Link href="/use-cases/tithing-declaration" className="text-[#0E96B0] hover:text-[#08647E] underline">
                  Tithing declaration
                </Link>
                {" "}·{" "}
                <Link href="/faq" className="text-[#0E96B0] hover:text-[#08647E] underline">
                  FAQ
                </Link>
                {" "}·{" "}
                <Link href="/about" className="text-[#0E96B0] hover:text-[#08647E] underline">
                  About
                </Link>
              </p>

              <h2 className="font-serif text-2xl text-[#0D2B35] mt-10 mb-4">
                Ready to try a simple sheet?
              </h2>

              <div className="flex flex-wrap gap-4 mt-6">
                <Link
                  href="/create"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white font-semibold rounded-full shadow-[0_4px_14px_rgba(14,150,176,0.35)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_6px_20px_rgba(14,150,176,0.45)] no-underline"
                >
                  Get Started
                </Link>
                <Link
                  href="/privacy"
                  className="inline-flex items-center px-6 py-3 border-[1.5px] border-[#0E96B0]/40 text-[#08647E] font-medium rounded-full transition-all duration-200 hover:border-[#0E96B0] hover:bg-[#E6F7FB] no-underline"
                >
                  Privacy Policy
                </Link>
                <Link
                  href="/terms"
                  className="inline-flex items-center px-6 py-3 border-[1.5px] border-[#0E96B0]/40 text-[#08647E] font-medium rounded-full transition-all duration-200 hover:border-[#0E96B0] hover:bg-[#E6F7FB] no-underline"
                >
                  Terms
                </Link>
              </div>
            </div>
          </div>
        </article>
      </main>
      <MarketingFooter />
    </div>
    </>
  );
}
