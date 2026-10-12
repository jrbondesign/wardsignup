import { withUtm } from "@/lib/utm";

export const MADE_WITH_UTM = {
  utm_source: "signup_sheet",
  utm_medium: "footer",
  utm_campaign: "made_with",
} as const;

export function madeWithHref(siteUrl: string): string {
  return withUtm(`${siteUrl.replace(/\/$/, "")}/`, MADE_WITH_UTM);
}

/** "Made with" line in the bottom footer of public signup sheets. */
export default function MadeWithFooter({ brandName, siteUrl }: { brandName: string; siteUrl: string }) {
  const compactName = brandName.replace(/\s+/g, "");
  return (
    <p className="text-sm text-[#5A8399] leading-relaxed text-center" data-testid="made-with-footer">
      Made with {compactName}.
      <br />
      <a
        href={madeWithHref(siteUrl)}
        className="font-semibold text-[#0E96B0] hover:text-[#08647E] underline decoration-[#0E96B0]/35 underline-offset-2"
      >
        Create your own signup sheet for FREE
      </a>
      .
    </p>
  );
}
