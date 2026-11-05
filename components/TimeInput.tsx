"use client";

import { useId, useState } from "react";

interface TimeInputProps {
  value: string;
  onChange: (next: string) => void;
  /** Unused; kept so existing call sites typecheck. */
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
  id?: string;
  /** Optional className is ignored for layout; compact built-in styles are used. */
  className?: string;
}

export type Meridiem = "" | "AM" | "PM";

export type TimeParts = {
  hour12: string;
  minute: string;
  meridiem: Meridiem;
};

/** Split a canonical "HH:MM" (24h) into 12-hour parts. Empty value → all blank. */
export function hhmmToParts(value: string): TimeParts {
  if (!value || !value.trim()) {
    return { hour12: "", minute: "", meridiem: "" };
  }
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return { hour12: "", minute: "", meridiem: "" };
  }
  const meridiem: Meridiem = h >= 12 ? "PM" : "AM";
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return {
    hour12: String(hour12),
    minute: String(m).padStart(2, "0"),
    meridiem,
  };
}

/**
 * Build a canonical 24-hour "HH:MM" from 12-hour parts.
 * Requires hour, minute, and AM/PM. 12 AM → 00:xx, 12 PM → 12:xx.
 * Returns "" when any part is missing.
 */
export function partsToHhmm(hour12: string, minute: string, meridiem: Meridiem): string {
  if (!hour12 || !minute || (meridiem !== "AM" && meridiem !== "PM")) return "";
  let h = parseInt(hour12, 10);
  const m = parseInt(minute, 10);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 1 || h > 12 || m < 0 || m > 59) return "";
  if (h === 12) h = 0;
  if (meridiem === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** True when the user has started filling the control but has not finished all three parts. */
export function isPartialTime(parts: TimeParts): boolean {
  const any = !!(parts.hour12 || parts.minute || parts.meridiem);
  if (!any) return false;
  return partsToHhmm(parts.hour12, parts.minute, parts.meridiem) === "";
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

/** Compact select chrome shared by hour, minute, and AM/PM. */
const selectBase =
  "min-w-0 text-sm leading-tight text-[#0D2B35] px-1.5 py-2 rounded-lg bg-white outline-none transition-all border-[1.5px] border-[rgba(14,150,176,0.22)] focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] disabled:opacity-60";

/**
 * Time picker with hour (1–12), minute, and AM/PM dropdown.
 * Stores the same 24-hour "HH:MM" string the rest of the app expects.
 */
export default function TimeInput({
  value,
  onChange,
  disabled,
  required,
  ariaLabel,
  id,
}: TimeInputProps) {
  const autoId = useId();
  const baseId = id || autoId;
  const [parts, setParts] = useState<TimeParts>(() => hhmmToParts(value));
  const [syncedValue, setSyncedValue] = useState(value);

  // Sync from parent during render (avoids set-state-in-effect lint).
  // Keep local partial edits when the parent holds "" because we emitted incomplete.
  const fromParts = partsToHhmm(parts.hour12, parts.minute, parts.meridiem);
  const incomplete =
    !!(parts.hour12 || parts.minute || parts.meridiem) && fromParts === "";
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (value !== fromParts) {
      if (!(value === "" && incomplete)) {
        setParts(hhmmToParts(value));
      }
    }
  }

  const emit = (next: Partial<TimeParts>) => {
    let merged: TimeParts = {
      hour12: next.hour12 !== undefined ? next.hour12 : parts.hour12,
      minute: next.minute !== undefined ? next.minute : parts.minute,
      meridiem: next.meridiem !== undefined ? next.meridiem : parts.meridiem,
    };
    // Clearing the hour clears the whole control.
    if (next.hour12 === "") {
      merged = { hour12: "", minute: "", meridiem: "" };
    } else if (next.hour12 && !merged.minute) {
      // Picking an hour with no minute defaults minute to 00.
      merged = { ...merged, minute: "00" };
    }
    setParts(merged);
    const hhmm = partsToHhmm(merged.hour12, merged.minute, merged.meridiem);
    if (hhmm !== value) onChange(hhmm);
  };

  const groupLabel = ariaLabel || "Time";
  const showPartial = isPartialTime(parts);
  const hintId = `${baseId}-hint`;

  return (
    <div className="min-w-0 w-full">
      <div
        role="group"
        aria-label={groupLabel}
        aria-describedby={showPartial ? hintId : undefined}
        className="flex gap-1.5 min-w-0 w-full items-stretch"
      >
        <select
          id={baseId}
          aria-label={`${groupLabel} hour`}
          value={parts.hour12}
          disabled={disabled}
          required={required}
          onChange={(e) => emit({ hour12: e.target.value })}
          className={`${selectBase} flex-1 min-w-[2.75rem]`}
        >
          <option value="">Hour</option>
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <select
          id={`${baseId}-minute`}
          aria-label={`${groupLabel} minute`}
          value={parts.minute}
          disabled={disabled}
          required={required}
          onChange={(e) => emit({ minute: e.target.value })}
          className={`${selectBase} flex-1 min-w-[2.75rem]`}
        >
          <option value="">Min</option>
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          id={`${baseId}-meridiem`}
          aria-label={`${groupLabel} AM or PM`}
          value={parts.meridiem}
          disabled={disabled}
          required={required}
          onChange={(e) => emit({ meridiem: e.target.value as Meridiem })}
          className={`${selectBase} flex-none w-[4.25rem]`}
        >
          <option value="">AM/PM</option>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
      {showPartial && (
        <p id={hintId} className="mt-1 text-[12px] text-amber-800">
          {required
            ? "Pick hour, minute, and AM or PM to set this time."
            : "This time is incomplete. Pick hour, minute, and AM or PM, or clear the hour."}
        </p>
      )}
    </div>
  );
}
