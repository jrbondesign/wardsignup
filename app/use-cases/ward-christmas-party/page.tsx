import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getBrandFromHost } from "@/lib/brand";
import { getEventTemplate } from "@/lib/event-template-data";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";

const PATH = "/use-cases/ward-christmas-party";
const CTA_HREF = "/create?template=ward-christmas-party";
const OG_IMAGE = "/templates/ward-christmas-party-og.jpg";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const brand = getBrandFromHost(host);
  const title = `Ward Christmas Party Signup Sheet · ${brand.shortName}`;
  const description =
    "A free Ward Christmas party signup sheet. Members claim soup, rolls and desserts or a job like setup or cleanup, and you see what is still needed. No account needed.";

  return {
    metadataBase: new URL(brand.siteUrl),
    title,
    description,
    alternates: { canonical: PATH },
    openGraph: {
      title,
      description,
      url: `${brand.siteUrl}${PATH}`,
      siteName: brand.shortName,
      type: "website",
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "A nativity scene under a bright star" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE] },
  };
}

const FAQS: { q: string; a: string }[] = [
  {
    q: "Do ward members need an account to sign up?",
    a: "No. Members open the link, pick something to bring or a job to help with, choose how many, and enter their name. There is no account, no app and no login.",
  },
  {
    q: "How do the counts work?",
    a: "Each item has a number needed. A family can claim more than one at a time, for example two desserts. When an item reaches its number it shows as full, so you do not end up with forty desserts and no soup. The counts in the template are a starting point. Change them to fit the size of your ward.",
  },
  {
    q: "Can members bring something that is not on the list?",
    a: "Yes. Below the list there is a spot where members can write in what they will bring, so nothing gets turned away.",
  },
  {
    q: "Will other members see who signed up?",
    a: "Not by default. Members see how many of each item are claimed, and leaders see every name on their dashboard. You can choose to show names if your ward prefers.",
  },
  {
    q: "Can a branch or stake use this too?",
    a: "Yes. It works the same for a branch, ward or stake Christmas party. Just rename the event and change the counts.",
  },
  {
    q: "Is Ward Signup official Church software?",
    a: "No. Ward Signup is an independent product and is not affiliated with or endorsed by The Church of Jesus Christ of Latter-day Saints.",
  },
];

export default async function WardChristmasPartyPage() {
  const template = getEventTemplate("ward-christmas-party");
  const items = template?.defaultItems ?? [];
  const food = items.filter((i) => i.section === "Food");
  const jobs = items.filter((i) => i.section === "Jobs");

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to make a Ward Christmas party signup sheet",
    description: "Set up food and job signups for your ward Christmas party with Ward Signup.",
    step: [
      { "@type": "HowToStep", name: "Start from the template", text: "Open the Ward Christmas Party template. The food list and jobs are already filled in." },
      { "@type": "HowToStep", name: "Set the date and counts", text: "Add the date, time and place, then change the counts to fit your ward." },
      { "@type": "HowToStep", name: "Share the link", text: "Share one link or print a flyer with a QR code for the bulletin or the foyer." },
      { "@type": "HowToStep", name: "Watch it fill", text: "See what is claimed and what is still needed on your dashboard." },
    ],
  };

  const card = "bg-white rounded-2xl shadow-[0_4px_20px_rgba(8,100,126,0.10)] border border-[#0E96B0]/10 p-6";

  return (
    <div className="min-h-screen bg-[#F4FAFB]">
      <MarketingNav />

      {/* Hero */}
      <section className="pt-[104px] pb-16 px-6 relative overflow-hidden bg-[#0B1A33]">
        <picture>
          <source srcSet="/templates/ward-christmas-party.webp" type="image/webp" />
          { }
          <img
            src="/templates/ward-christmas-party.jpg"
            alt=""
            className="absolute inset-0 w-full h-full object-cover z-0"
            fetchPriority="high"
          />
        </picture>
        <div className="absolute inset-0 z-[1] bg-gradient-to-b from-[#0B1A33]/70 via-[#0B1A33]/45 to-[#0B1A33]/80" />
        <div className="relative z-[2] max-w-[760px] mx-auto text-center">
          <h1 className="font-serif text-[clamp(38px,7vw,56px)] tracking-[-1.2px] text-white mb-5 leading-[1.1]">
            Ward Christmas party signup sheet
          </h1>
          <p className="text-[clamp(17px,2.4vw,20px)] text-white/90 mb-8 max-w-[560px] mx-auto leading-[1.6]">
            One link for the food and the helpers. Members claim soup, rolls, desserts or a job, and you can see what is still needed at a glance.
          </p>
          <Link href={CTA_HREF} className="text-base font-semibold px-8 py-3.5 rounded-full bg-white text-[#08647E] no-underline shadow-[0_8px_28px_rgba(0,0,0,0.25)] inline-flex items-center gap-2 hover:-translate-y-0.5 transition-all">
            Use this template
          </Link>
        </div>
      </section>

      {/* What is on the sheet */}
      <section className="py-[88px] px-6 bg-white">
        <div className="max-w-[860px] mx-auto">
          <h2 className="font-serif text-[clamp(28px,4vw,40px)] text-center tracking-[-0.6px] text-[#0D2B35] mb-3 leading-[1.15]">
            What is on the sheet
          </h2>
          <p className="text-[17px] text-[#5A8399] text-center max-w-[560px] mx-auto mb-12 leading-[1.65]">
            Based on a real ward Christmas party sheet. Every count is a suggestion you can change.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className={card}>
              <h3 className="font-serif text-[22px] text-[#0D2B35] mb-4">Food</h3>
              <ul className="space-y-2">
                {food.map((i) => (
                  <li key={i.label} className="flex justify-between gap-4 text-[16px] text-[#2E5566]">
                    <span>{i.label}</span>
                    <span className="font-semibold text-[#0D2B35]">{i.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={card}>
              <h3 className="font-serif text-[22px] text-[#0D2B35] mb-4">Jobs</h3>
              <ul className="space-y-2">
                {jobs.map((i) => (
                  <li key={i.label} className="flex justify-between gap-4 text-[16px] text-[#2E5566]">
                    <span>{i.label}</span>
                    <span className="font-semibold text-[#0D2B35]">{i.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-[16px] text-[#5A8399] mt-6 text-center">
            Members can also write in something that is not on the list.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="py-[88px] px-6 bg-[#F4FAFB]">
        <div className="max-w-[760px] mx-auto">
          <h2 className="font-serif text-[clamp(28px,4vw,40px)] tracking-[-0.6px] text-[#0D2B35] mb-6 leading-[1.15]">
            How it works
          </h2>
          <ol className="space-y-5 text-[17px] text-[#2E5566] leading-[1.75] list-decimal pl-6">
            <li><strong>Start from the template.</strong> The food list and jobs are already filled in.</li>
            <li><strong>Set the date and counts.</strong> Add the date, time and place, then change the counts to fit your ward.</li>
            <li><strong>Share the link.</strong> Send it by text or email, or choose Print flyer for a QR code in the bulletin or the foyer.</li>
            <li><strong>Watch it fill.</strong> Each item shows how many are claimed. When one is full, it closes, so families pick what is still needed.</li>
          </ol>
          <p className="text-[17px] text-[#2E5566] leading-[1.75] mt-6">
            Each label says the batch size, like &ldquo;serves 10 to 20&rdquo; or &ldquo;2 dozen,&rdquo; so everyone knows how much to bring. A family can claim more than one at a time.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-[88px] px-6 bg-white">
        <div className="max-w-[720px] mx-auto">
          <h2 className="font-serif text-[clamp(28px,4vw,40px)] text-center tracking-[-0.6px] text-[#0D2B35] mb-12 leading-[1.15]">
            Common questions
          </h2>
          <div className="space-y-8">
            {FAQS.map((f) => (
              <div key={f.q}>
                <h3 className="font-serif text-[20px] text-[#0D2B35] mb-3">{f.q}</h3>
                <p className="text-[17px] leading-[1.7] text-[#2E5566]">{f.a}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 pt-8 border-t border-[#0E96B0]/10 text-sm text-[#5A8399]">
            <p className="mb-2">Related:</p>
            <div className="flex flex-wrap gap-4">
              <Link href="/use-cases" className="text-[#0E96B0] hover:text-[#08647E] underline">All use cases</Link>
              <Link href="/faq" className="text-[#0E96B0] hover:text-[#08647E] underline">FAQ</Link>
              <Link href="/compare/signupgenius" className="text-[#0E96B0] hover:text-[#08647E] underline">Ward Signup vs SignUpGenius</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Church Independence Notice */}
      <section className="py-[88px] px-6 bg-[#F4FAFB]">
        <div className="max-w-[760px] mx-auto">
          <div className="bg-[#FFF8E1] border-l-4 border-[#F9A825] p-8 rounded-r-lg">
            <h2 className="font-serif text-[24px] text-[#0D2B35] tracking-[-0.3px] mb-4 mt-0">Independent of the Church</h2>
            <p className="text-[17px] leading-[1.7] text-[#2E5566] mb-0">
              Ward Signup is an <strong>independent</strong> product. It is <strong>not</strong> official Church software and is <strong>not</strong> affiliated with or endorsed by The Church of Jesus Christ of Latter-day Saints.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-[88px] px-6 bg-white">
        <div className="max-w-[660px] mx-auto text-center">
          <h2 className="font-serif text-[clamp(26px,4vw,36px)] text-[#0D2B35] tracking-[-0.5px] mb-4 leading-[1.15]">
            Ready to plan your ward Christmas party?
          </h2>
          <p className="text-[17px] text-[#5A8399] mb-8 max-w-[480px] mx-auto leading-[1.6]">
            Free to use. The list is ready, so you can share it in a few minutes.
          </p>
          <Link href={CTA_HREF} className="inline-flex items-center gap-2 text-base font-semibold px-8 py-3.5 rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white no-underline shadow-[0_8px_28px_rgba(14,150,176,0.35)] hover:-translate-y-[1px] transition-all">
            Use this template
          </Link>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }} />

      <MarketingFooter />
    </div>
  );
}
