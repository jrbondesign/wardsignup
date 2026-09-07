"use client";

import type { EventType } from "@/lib/types";

interface Option {
  value: EventType;
  label: string;
  desc: string;
  icon: React.ReactNode;
}

const OPTIONS: Option[] = [
  {
    value: "rsvp",
    label: "Single Event",
    desc: "One thing happening. People say they're coming.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    value: "spots",
    label: "Scheduled Sessions",
    desc: "People pick a time slot.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
  {
    value: "items",
    label: "Bring or Do",
    desc: "People claim items or tasks.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <polyline points="9 11 12 14 22 4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    ),
  },
];

interface Props {
  value: EventType;
  onChange: (next: EventType) => void;
}

export default function EventTypePicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {OPTIONS.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            type="button"
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex items-start gap-2.5 p-3.5 rounded-xl border-[1.5px] text-left transition-all ${
              selected
                ? "border-[#0E96B0] bg-[#E6F7FB] shadow-[0_0_0_3px_rgba(14,150,176,0.10)]"
                : "border-[rgba(14,150,176,0.20)] hover:border-[#0E96B0] hover:bg-[#F4FAFB]"
            }`}
            aria-pressed={selected}
          >
            <span className={selected ? "text-[#0E96B0]" : "text-[#5A8399]"}>
              {opt.icon}
            </span>
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[13px] font-semibold text-[#0D2B35]">{opt.label}</span>
              <span className="text-[11px] text-[#5A8399] leading-snug">{opt.desc}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
