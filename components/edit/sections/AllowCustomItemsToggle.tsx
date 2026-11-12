"use client";

import { SettingsToggle } from "@/components/create/sections/OptionalDisclosureCard";

/**
 * Items events: organizer switch for the public "I'm also bringing…" box.
 * Hidden when the database does not have the setting yet (pre-migration).
 */
export default function AllowCustomItemsToggle({
  supported,
  checked,
  onChange,
}: {
  supported: boolean;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  if (!supported) return null;
  return (
    <div className="bg-white border border-[rgba(14,150,176,0.18)] rounded-xl px-[18px] py-[14px] mb-6" data-testid="allow-custom-items">
      <SettingsToggle
        checked={checked}
        onChange={onChange}
        label="Let people add their own items"
        help={"Shows an \u201cI\u2019m also bringing\u2026\u201d box under your list so people can add something you didn\u2019t list. Turn it off if you only want items from your list."}
      />
    </div>
  );
}
