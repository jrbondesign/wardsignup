"use client";

import type { ReactNode } from "react";

interface Props {
  /** Card heading — names the component. */
  title: string;
  /** One-line explanation shown under the title. */
  description?: string;
  /** Small icon chip on the left of the header. */
  icon?: ReactNode;
  /** Optional add-on styling: tinted card + an "Optional" pill in the header. */
  optional?: boolean;
  children: ReactNode;
}

/**
 * Visual wrapper that makes each piece of the create form read as a distinct,
 * self-contained component — clear border, header, and breathing room — so it's
 * obvious where one block ends and the next begins. `optional` cards are tinted
 * and flagged so add-ons are visually separable from required fields.
 */
export default function ComponentCard({ title, description, icon, optional, children }: Props) {
  return (
    <section
      className={`rounded-2xl border-[1.5px] p-4 sm:p-5 ${
        optional
          ? "border-[rgba(14,150,176,0.18)] bg-[#F8FCFD]"
          : "border-[rgba(14,150,176,0.22)] bg-white shadow-[0_1px_3px_rgba(8,100,126,0.05)]"
      }`}
    >
      <div className="flex items-start gap-3 mb-4">
        {icon && (
          <span className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-[#E6F7FB] text-[#0E96B0] flex items-center justify-center">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-semibold text-[#0D2B35]">{title}</h2>
            {optional && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#5A8399] bg-white border border-[rgba(14,150,176,0.25)] rounded-full px-2 py-0.5">
                Optional
              </span>
            )}
          </div>
          {description && (
            <p className="text-[12px] text-[#5A8399] leading-snug mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}
