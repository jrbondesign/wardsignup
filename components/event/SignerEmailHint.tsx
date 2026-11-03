import { splitEmphasis } from "@/lib/reminder-copy";

/**
 * Helper text under the optional Email field on the public signup forms.
 * "get a reminder" renders bold in the brand teal (#08647E on white is about 6.7:1,
 * so it passes WCAG AA for small text); the wording itself is unchanged.
 */
export default function SignerEmailHint({ text }: { text: string }) {
  return (
    <p className="mt-1.5 text-[11px] text-[#5A8399] leading-snug" data-testid="signer-email-hint">
      {splitEmphasis(text).map((part, i) =>
        part.emphasis ? (
          <strong key={i} className="font-semibold text-[#08647E]">
            {part.text}
          </strong>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}
