/**
 * Sponsor thank yous shown near the bottom of the About page, after the
 * product copy, matching Dana's About page mockup v1.
 *
 * Arizona Consumer Law Group logo (public/sponsors/arizona-consumer-law-group-logo.webp):
 * https://www.consumerwarrior.com/logo-white-transparent.webp
 * That is the official cream wordmark used in the firm's header, footer,
 * and schema.org logo. It only reads on a dark field, so it keeps a dark
 * plate inside the shared white logo chip.
 *
 * Local Senior Advisor logo (public/sponsors/local-senior-advisor-logo.webp):
 * https://localsenioradvisor.com/images/logo.png, the schema.org logo on the
 * LSA home page, resized to 256px and saved as WebP. It sits next to the name
 * in the same white chip, the way the LSA site header pairs its mark with
 * the name.
 */
import Image from "next/image";

const SPONSOR_REL = "sponsored noopener";

const ACLG_HREF = "https://www.consumerwarrior.com/";
const LSA_HREF = "https://localsenioradvisor.com/";

const cardClass = "bg-white border border-[#D3E6EA] rounded-xl p-6";
const chipClass =
  "flex md:inline-flex items-center justify-start gap-3 h-[66px] md:h-[70px] w-full md:w-auto md:min-w-[286px] max-w-full px-4 py-3 mb-4 bg-white border border-[#D3E6EA] rounded-lg no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E96B0]";
const bodyClass = "text-[17px] leading-[1.7] text-[#2E5566] mb-4";
const visitClass =
  "text-[16px] text-[#0E96B0] font-medium hover:text-[#08647E] transition-colors";

export default function AboutSponsorSection() {
  return (
    <section aria-labelledby="about-sponsors-heading" className="mb-10">
      <h2
        id="about-sponsors-heading"
        className="font-serif text-[28px] text-[#0D2B35] tracking-[-0.3px] mb-4 mt-8"
      >
        Thank you to our sponsors
      </h2>
      <p className="text-[17px] leading-[1.7] text-[#2E5566] mb-6">
        These sponsors help cover the cost of running WardSignup. Sponsors get no data from WardSignup and have no say in how the site works. Sponsorship is not an endorsement by The Church of Jesus Christ of Latter-day Saints.
      </p>

      <div className="flex flex-col gap-10">
        <article aria-label="Arizona Consumer Law Group" className={cardClass}>
          <a href={ACLG_HREF} target="_blank" rel={SPONSOR_REL} className={chipClass}>
            <Image
              src="/sponsors/arizona-consumer-law-group-logo.webp"
              alt="Arizona Consumer Law Group logo"
              width={738}
              height={134}
              className="block h-10 md:h-11 w-auto bg-[#0D2B35] rounded"
            />
          </a>
          <p className={bodyClass}>
            Arizona Consumer Law Group and its managing attorney, John Skiba, are WardSignup&apos;s first sponsor. Their support helps keep WardSignup free for every ward.
          </p>
          <p className="mb-0">
            <a href={ACLG_HREF} target="_blank" rel={SPONSOR_REL} className={visitClass}>
              Visit Arizona Consumer Law Group
            </a>
          </p>
        </article>

        <article aria-label="Local Senior Advisor" className={cardClass}>
          <a href={LSA_HREF} target="_blank" rel={SPONSOR_REL} className={chipClass}>
            <Image
              src="/sponsors/local-senior-advisor-logo.webp"
              alt="Local Senior Advisor logo"
              width={256}
              height={256}
              className="block h-10 md:h-11 w-auto shrink-0"
            />
            <span className="font-semibold text-[18px] md:text-[20px] leading-[1.2] text-[#0851BA] whitespace-nowrap">
              Local Senior Advisor
            </span>
          </a>
          <p className={bodyClass}>
            Local Senior Advisor and Randy Chipman help cover the cost of running WardSignup. Randy is a Certified Senior Advisor with more than 12 years of experience helping Utah families find the right senior living community.
          </p>
          <p className="mb-0">
            <a href={LSA_HREF} target="_blank" rel={SPONSOR_REL} className={visitClass}>
              Visit Local Senior Advisor
            </a>
          </p>
        </article>
      </div>
    </section>
  );
}
