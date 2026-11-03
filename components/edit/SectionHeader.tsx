"use client";

import MenuTrigger from "./MenuTrigger";

interface SectionHeaderProps {
  /** Section name as the organizer typed it (shown uppercase via CSS). */
  name: string;
  /** Location every slot in this section shares, shown once under the label. */
  sharedLocation?: string | null;
  onOpenMenu: (button: HTMLElement) => void;
}

/** Section label inside a day in the editor, with its three dots menu on the
 *  same right edge as the day and slot menus. */
export default function SectionHeader({ name, sharedLocation, onOpenMenu }: SectionHeaderProps) {
  return (
    <div className="pl-0.5 pr-[17px] md:pr-[21px] pt-2 pb-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.6px] text-[#5A8399]">
          {name}
        </div>
        {/* Negative margin keeps the 44px target without adding height, so the
            gap to the first card matches the gap between cards. */}
        <MenuTrigger label={`Options for ${name}`} onOpen={onOpenMenu} className="-my-[13px]" />
      </div>
      {sharedLocation && (
        <div className="mt-0.5 text-[12px] text-[#5A8399] truncate" title={sharedLocation}>
          {sharedLocation}
        </div>
      )}
    </div>
  );
}
