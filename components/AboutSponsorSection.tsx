/**
 * Sponsor thank yous shown at the top of the About page.
 *
 * Arizona Consumer Law Group logo (public/sponsors/arizona-consumer-law-group-logo.webp):
 * https://www.consumerwarrior.com/logo-white-transparent.webp
 * That is the official cream wordmark used in the firm's header, footer,
 * and schema.org logo. No color or dark wordmark is published on the site,
 * so the mark sits on the About page ink color at a modest size.
 *
 * Local Senior Advisor logo (public/sponsors/local-senior-advisor-logo.webp):
 * https://localsenioradvisor.com/images/logo.png, the schema.org logo on the
 * LSA home page, resized to 256px and saved as WebP. It is a blue mark on a transparent
 * background, so it sits on a white chip next to the name, the same way the
 * LSA site header pairs its mark with the name.
 */
import Image from "next/image";

const SPONSOR_REL = "sponsored noopener";

const ACLG_HREF = "https://www.consumerwarrior.com/";
const LSA_HREF = "https://localsenioradvisor.com/";

const chipClass =
  "inline-flex items-center justify-center rounded-lg px-4 py-3 mb-4 no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E96B0]";
const headingClass =
  "font-serif text-[28px] text-[#0D2B35] tracking-[-0.3px] mb-4 mt-0";
const bodyClass = "text-[17px] leading-[1.7] text-[#2E5566] mb-4";
const visitClass =
  "text-[#0E96B0] font-medium hover:text-[#08647E] transition-colors";

export default function AboutSponsorSection() {
  return (
    <>
      <section aria-label="Thank you to our first sponsor" className="mb-10">
        <a
          href={ACLG_HREF}
          target="_blank"
          rel={SPONSOR_REL}
          className={`${chipClass} bg-[#0D2B35]`}
        >
          <Image
            src="/sponsors/arizona-consumer-law-group-logo.webp"
            alt="Arizona Consumer Law Group logo"
            width={738}
            height={134}
            priority
            className="h-10 sm:h-11 w-auto"
          />
        </a>
        <p className={headingClass}>Thank you to our first sponsor</p>
        <p className={bodyClass}>
          Arizona Consumer Law Group and its managing attorney, John Skiba, are WardSignup&apos;s first sponsor. Their support helps keep WardSignup free for every ward.
        </p>
        <p className="mb-0">
          <a href={ACLG_HREF} target="_blank" rel={SPONSOR_REL} className={visitClass}>
            Visit Arizona Consumer Law Group
          </a>
        </p>
      </section>

      <section aria-label="Thank you to Local Senior Advisor" className="mb-10">
        <a
          href={LSA_HREF}
          target="_blank"
          rel={SPONSOR_REL}
          className={`${chipClass} gap-3 bg-white border border-[#D3E6EA]`}
        >
          <Image
            src="/sponsors/local-senior-advisor-logo.webp"
            alt="Local Senior Advisor logo"
            width={256}
            height={256}
            className="h-10 sm:h-11 w-auto"
          />
          <span className="font-semibold text-[18px] sm:text-[20px] text-[#0851BA]">
            Local Senior Advisor
          </span>
        </a>
        <p className={headingClass}>Thank you to Local Senior Advisor</p>
        <p className={bodyClass}>
          Local Senior Advisor and Randy Chipman are sponsoring WardSignup. Local Senior Advisor helps families find senior living communities. Their support helps keep WardSignup free for every ward.
        </p>
        <p className="mb-0">
          <a href={LSA_HREF} target="_blank" rel={SPONSOR_REL} className={visitClass}>
            Visit Local Senior Advisor
          </a>
        </p>
      </section>
    </>
  );
}
