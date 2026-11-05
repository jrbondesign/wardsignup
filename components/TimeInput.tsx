"use client";

import { useId, useMemo } from "react";

interface TimeInputProps {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  /** Kept for call-site compatibility; unused now that AM/PM is a dropdown. */
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
  id?: string;
}

type Meridiem = "AM" | "PM";

export type TimeParts = {
  hour12: string;
  minute: string;
  meridiem: Meridiem;
};

/** Split a canonical "HH:MM" (24h) into 12-hour parts. Empty value → blank hour/minute. */
export function hhmmToParts(value: string): TimeParts {
  if (!value || !value.trim()) {
    return { hour12: "", minute: "", meridiem: "AM" };
  }
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return { hour12: "", minute: "", meridiem: "AM" };
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
 * 12 AM → 00:xx, 12 PM → 12:xx. Returns "" if hour or minute is blank.
 */
export function partsToHhmm(hour12: string, minute: string, meridiem: Meridiem): string {
  if (!hour12 || !minute) return "";
  let h = parseInt(hour12, 10);
  const m = parseInt(minute, 10);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 1 || h > 12 || m < 0 || m > 59) return "";
  if (h === 12) h = 0;
  if (meridiem === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

/**
 * Time picker with hour (1–12), minute, and AM/PM dropdown.
 * Stores the same 24-hour "HH:MM" string the rest of the app expects.
 * Built so mobile users can pick AM/PM without typing letters.
 */
export default function TimeInput({
  value,
  onChange,
  className,
  disabled,
  required,
  ariaLabel,
  id,
}: TimeInputProps) {
  const autoId = useId();
  const baseId = id || autoId;
  const parts = useMemo(() => hhmmToParts(value), [value]);

  const fieldCls = [className, "!w-auto flex-1 min-w-0"].filter(Boolean).join(" ");
  const meridiemCls = [className, "!w-auto flex-none min-w-[4.5rem]"].filter(Boolean).join(" ");

  const emit = (next: Partial<TimeParts>) => {
    const hour12 = next.hour12 !== undefined ? next.hour12 : parts.hour12;
    const minute = next.minute !== undefined ? next.minute : parts.minute;
    const meridiem = next.meridiem !== undefined ? next.meridiem : parts.meridiem;
    const hhmm = partsToHhmm(hour12, minute, meridiem);
    if (hhmm !== value) onChange(hhmm);
  };

  const groupLabel = ariaLabel || "Time";

  return (
    <div
      role="group"
      aria-label={groupLabel}
      className="flex gap-2 min-w-0 w-full items-stretch"
    >
      <select
        id={baseId}
        aria-label={`${groupLabel} hour`}
        value={parts.hour12}
        disabled={disabled}
        required={required}
        onChange={(e) => emit({ hour12: e.target.value })}
        className={fieldCls}
      >
        <option value="">{required ? "Hour" : ""}</option>
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
        className={fieldCls}
      >
        <option value="">{required ? "Min" : ""}</option>
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
        className={meridiemCls}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
