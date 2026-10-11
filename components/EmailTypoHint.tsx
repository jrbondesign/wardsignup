"use client";

import { suggestEmailFix } from "@/lib/email-typo";

/** Shows "Did you mean x@gmail.com?" under an email field when it spots a typo. */
export default function EmailTypoHint({
  email,
  onAccept,
}: {
  email: string;
  onAccept: (fixed: string) => void;
}) {
  const fix = email ? suggestEmailFix(email) : null;
  if (!fix) return null;
  return (
    <p className="mt-1.5 text-[12px] text-[#b45309] leading-snug" role="status">
      Did you mean{" "}
      <button
        type="button"
        onClick={() => onAccept(fix)}
        className="font-semibold underline text-[#0E96B0] hover:text-[#08647E]"
      >
        {fix}
      </button>
      ?
    </p>
  );
}
