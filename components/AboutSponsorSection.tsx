/**
 * First sponsor thank you shown at the top of the About page.
 *
 * Logo source (saved as public/sponsors/arizona-consumer-law-group-logo.webp):
 * https://www.consumerwarrior.com/logo-white-transparent.webp
 * That is the official cream wordmark used in the firm's header, footer,
 * and schema.org logo. No color or dark wordmark is published on the site,
 * so the mark sits on the About page ink color at a modest size.
 */
import Image from "next/image";

const SPONSOR_HREF = "https://www.consumerwarrior.com/";
const SPONSOR_REL = "sponsored noopener";

export default function AboutSponsorSection() {
  return (
    <section aria-label="Thank you to our first sponsor" className="mb-10">
      <a
        href={SPONSOR_HREF}
        target="_blank"
        rel={SPONSOR_REL}
        className="inline-flex items-center justify-center rounded-lg bg-[#0D2B35] px-4 py-3 mb-4 no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E96B0]"
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
      <p className="font-serif text-[28px] text-[#0D2B35] tracking-[-0.3px] mb-4 mt-0">
        Thank you to our first sponsor
      </p>
      <p className="text-[17px] leading-[1.7] text-[#2E5566] mb-4">
        Arizona Consumer Law Group and its managing attorney, John Skiba, are WardSignup&apos;s first sponsor. Their support helps keep WardSignup free for every ward.
      </p>
      <p className="mb-0">
        <a
          href={SPONSOR_HREF}
          target="_blank"
          rel={SPONSOR_REL}
          className="text-[#0E96B0] font-medium hover:text-[#08647E] transition-colors"
        >
          Visit Arizona Consumer Law Group
        </a>
      </p>
    </section>
  );
}
