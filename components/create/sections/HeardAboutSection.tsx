"use client";

import ComponentCard from "./ComponentCard";

type HeardAboutChoice = "signed_up_on_event" | "friend_or_ward" | "search" | "facebook" | "ai_chat" | "other" | null;

interface Props {
  heardAboutChoice: HeardAboutChoice;
  heardAboutOtherText: string;
  onHeardAboutChoiceChange: (choice: HeardAboutChoice) => void;
  onHeardAboutOtherTextChange: (text: string) => void;
}

const CHOICES: Array<{ value: HeardAboutChoice; label: string }> = [
  { value: "signed_up_on_event", label: "Signed up on someone's event" },
  { value: "friend_or_ward", label: "Friend or ward member" },
  { value: "search", label: "Search" },
  { value: "facebook", label: "Facebook" },
  { value: "ai_chat", label: "AI chat" },
  { value: "other", label: "Other" },
];

export default function HeardAboutSection({
  heardAboutChoice,
  heardAboutOtherText,
  onHeardAboutChoiceChange,
  onHeardAboutOtherTextChange,
}: Props) {
  return (
    <ComponentCard
      title="How did you hear about WardSignup?"
      subtitle="Optional. Helps us improve."
    >
      <div className="space-y-2">
        {CHOICES.map((choice) => (
          <label
            key={choice.value}
            className="flex items-start gap-3 p-3 rounded-xl border-[1.5px] border-[#0E96B0]/20 hover:border-[#0E96B0]/40 hover:bg-[#F4FAFB] cursor-pointer transition-all"
          >
            <input
              type="radio"
              name="heard_about"
              value={choice.value ?? ""}
              checked={heardAboutChoice === choice.value}
              onChange={() => onHeardAboutChoiceChange(choice.value)}
              className="mt-0.5 w-4 h-4 text-[#0E96B0] border-[#0E96B0]/40 focus:ring-[#0E96B0]"
            />
            <span className="text-[14px] text-[#0D2B35]">{choice.label}</span>
          </label>
        ))}
      </div>

      {heardAboutChoice === "other" && (
        <div className="mt-3">
          <input
            type="text"
            value={heardAboutOtherText}
            onChange={(e) => onHeardAboutOtherTextChange(e.target.value)}
            placeholder="Please specify"
            maxLength={200}
            className="w-full px-4 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/30 focus:border-[#0E96B0] focus:outline-none text-[#0D2B35] placeholder-[#5A8399]/60"
          />
        </div>
      )}
    </ComponentCard>
  );
}
