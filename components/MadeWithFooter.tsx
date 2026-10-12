import { withUtm } from "@/lib/utm";

export const MADE_WITH_UTM = {
  utm_source: "signup_sheet",
  utm_medium: "footer",
  utm_campaign: "made_with",
} as const;

export function madeWithHref(siteUrl: string): string {
  return withUtm(`${siteUrl.replace(/\/$/, "")}/`, MADE_WITH_UTM);
}

/** Subtle "Made with" credit at the bottom of public signup sheets. */
export default function MadeWithFooter({ brandName, siteUrl }: { brandName: string; siteUrl: string }) {
  const compactName = brandName.replace(/\s+/g, "");
  return (
    <footer className="mt-10 mb-2 text-center text-xs leading-relaxed text-[#5A8399]/80" data-testid="made-with-footer">
      <a
        href={madeWithHref(siteUrl)}
        className="inline-block px-2 py-1 text-inherit no-underline hover:text-[#0E96B0] hover:underline"
      >
        Made with {compactName}. Create your own free.
      </a>
    </footer>
  );
}
