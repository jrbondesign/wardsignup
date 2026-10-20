"use client";

import { EMAIL_NUDGE_COPY } from "@/lib/email-nudge";

/** One time "Want a reminder before your time?" card shown above Sign Up (test arm only). */
export default function EmailNudgePrompt({
  onAdd,
  onSkip,
  disabled,
}: {
  onAdd: () => void;
  onSkip: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="region"
      aria-live="polite"
      aria-label={EMAIL_NUDGE_COPY.title}
      data-testid="email-nudge"
      className="rounded-xl border-[1.5px] border-[rgba(14,150,176,0.30)] bg-[#E6F7FB] px-4 py-3"
    >
      <p className="text-sm font-semibold text-[#0D2B35]">{EMAIL_NUDGE_COPY.title}</p>
      <p className="mt-1 text-[13px] text-[#2E5566] leading-snug">{EMAIL_NUDGE_COPY.body}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl text-white bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] disabled:opacity-60"
        >
          {EMAIL_NUDGE_COPY.addButton}
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={disabled}
          className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl text-[#2E5566] hover:bg-white/60 disabled:opacity-60"
        >
          {EMAIL_NUDGE_COPY.skipButton}
        </button>
      </div>
    </div>
  );
}
