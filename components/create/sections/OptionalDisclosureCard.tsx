"use client";

import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  icon?: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** When true, show an On pill; when false, show Off. */
  active: boolean;
  children: ReactNode;
}

/**
 * Collapsible optional add-on row used on create, edit, and manage.
 * On/Off reflects whether any setting inside the row is currently enabled.
 */
export default function OptionalDisclosureCard({
  title,
  description,
  icon,
  open,
  onToggle,
  active,
  children,
}: Props) {
  return (
    <section className="rounded-2xl border-[1.5px] border-[rgba(14,150,176,0.18)] bg-[#F8FCFD] p-4 sm:p-5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center gap-3 w-full text-left"
      >
        {icon && (
          <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#E6F7FB] text-[#0E96B0] flex items-center justify-center">
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold text-[#0D2B35]">{title}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#5A8399] bg-white border border-[rgba(14,150,176,0.25)] rounded-full px-2 py-0.5">
              Optional
            </span>
            <ActivePill active={active} />
          </span>
          {description && (
            <span className="block text-[12px] text-[#5A8399] leading-snug mt-0.5">
              {description}
            </span>
          )}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`flex-shrink-0 w-4 h-4 text-[#5A8399] transition-transform ${open ? "rotate-90" : ""}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}

export function ActivePill({ active }: { active: boolean }) {
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 border ${
        active
          ? "text-[#0E96B0] bg-[#E6F7FB] border-[rgba(14,150,176,0.35)]"
          : "text-[#5A8399] bg-white border-[rgba(14,150,176,0.25)]"
      }`}
    >
      {active ? "On" : "Off"}
    </span>
  );
}

export function SettingsToggle({
  checked,
  onChange,
  label,
  help,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  help?: string;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 rounded border-[rgba(14,150,176,0.4)] text-[#0E96B0] focus:ring-[#0E96B0]"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium text-[#2E5566]">{label}</span>
        {help && <span className="text-[12px] text-[#5A8399]">{help}</span>}
      </span>
    </label>
  );
}
