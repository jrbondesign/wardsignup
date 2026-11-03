"use client";

import { CALLING_MAX_LENGTH, CALLING_OPTIONS, CALLING_OTHER } from "@/lib/callings";

interface CallingFieldProps {
  /** Picklist value: "", one of CALLING_OPTIONS, or CALLING_OTHER. */
  choice: string;
  otherText: string;
  onChoiceChange: (choice: string) => void;
  onOtherTextChange: (text: string) => void;
  disabled?: boolean;
  /** Prefix for element ids so two instances never collide. */
  idPrefix?: string;
}

const inputClass =
  "w-full px-4 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/30 focus:border-[#0E96B0] focus:outline-none text-[#0D2B35] placeholder-[#5A8399]/60 bg-white disabled:bg-[#F4FAFB] disabled:cursor-not-allowed";

/** Optional "Your calling" picklist with an "Other" free text fallback. */
export default function CallingField({
  choice,
  otherText,
  onChoiceChange,
  onOtherTextChange,
  disabled,
  idPrefix = "calling",
}: CallingFieldProps) {
  const selectId = `${idPrefix}-select`;
  const otherId = `${idPrefix}-other`;
  return (
    <div>
      <label htmlFor={selectId} className="block text-[12px] font-semibold text-[#0D2B35] mb-1.5">
        Your calling <span className="font-normal text-[#5A8399]">(optional)</span>
      </label>
      <select
        id={selectId}
        value={choice}
        onChange={(e) => onChoiceChange(e.target.value)}
        disabled={disabled}
        className={inputClass}
      >
        <option value="">Choose your calling</option>
        {CALLING_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value={CALLING_OTHER}>Other</option>
      </select>
      {choice === CALLING_OTHER && (
        <input
          id={otherId}
          type="text"
          aria-label="Your calling"
          value={otherText}
          onChange={(e) => onOtherTextChange(e.target.value)}
          disabled={disabled}
          placeholder="e.g. Stake clerk"
          maxLength={CALLING_MAX_LENGTH}
          className={`${inputClass} mt-2`}
        />
      )}
    </div>
  );
}
