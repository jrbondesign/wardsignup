"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface TimeInputProps {
  value: string;
  onChange: (next: string) => void;
  /** Unused; kept so existing call sites typecheck. */
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
  id?: string;
  /** Optional; TimeInput uses its own chrome sized to match neighboring inputs. */
  className?: string;
  /**
   * When false, skip setCustomValidity so a parent page form Save is not blocked
   * (panel type=button handlers validate instead). Default true.
   */
  nativeValidity?: boolean;
  /**
   * Visible legend text, e.g. "Start time". When set, the three selects are wrapped
   * in a fieldset with this legend so the pair is labelled on screen and for screen readers.
   */
  label?: string;
  /** Lighter sublabel after the legend, e.g. "(required)" or "(optional)". */
  labelNote?: string;
  /** "micro" matches the small uppercase labels in the sessions list. */
  labelVariant?: "default" | "micro";
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

/**
 * 44px tall on phones, 40px from sm up, 12px radius, 14px text.
 * Phones share the row (flex-1); from sm up each select has a fixed width so the
 * group stays compact instead of stretching across the card. The native arrow is
 * replaced by a small chevron so placeholders like "Minute" and "AM/PM" fit and
 * the control looks the same in iOS Safari and Chrome.
 * Phone padding and min widths are as tight as the placeholders allow so a group
 * fits in 212px (the narrowest panel at 320); sm and up get roomier padding.
 * Every sm: size is repeated as @min-[35rem]: so a TimeRangeRow that goes side by
 * side below sm (cards 560px+ on 600 to 639px screens) gets the same compact sizing.
 * On phones each select shares the row but stops at 96px so wide phones and small
 * tablets do not stretch them across the card. Minute stays 80px from sm up because
 * its "Minute" placeholder (about 45px) would clip at 76px with the chevron padding.
 */
const selectBase =
  "appearance-none bg-no-repeat bg-[position:right_5px_center] sm:bg-[position:right_8px_center] @min-[35rem]:bg-[position:right_8px_center] min-w-0 h-11 sm:h-10 @min-[35rem]:h-10 py-0 pl-1.5 pr-[18px] sm:pl-2.5 @min-[35rem]:pl-2.5 sm:pr-[22px] @min-[35rem]:pr-[22px] text-sm text-[#0D2B35] rounded-xl bg-white outline-none transition-all border-[1.5px] border-[rgba(14,150,176,0.22)] focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] disabled:opacity-60 flex-1 max-w-24 sm:flex-none @min-[35rem]:flex-none sm:max-w-none @min-[35rem]:max-w-none";

const CHEVRON_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='none' stroke='%235A8399' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M1 1.5l5 5 5-5'/%3E%3C/svg%3E\")",
  backgroundSize: "10px 7px",
} as const;

/** Shared legend styles so every time pair reads the same. */
export const TIME_LABEL_CLASS: Record<"default" | "micro", string> = {
  default: "block text-[13px] leading-5 font-semibold text-[#2E5566] tracking-[0.2px] mb-1",
  micro: "block text-[11px] leading-4 font-semibold text-[#5A8399] uppercase tracking-[0.4px] mb-1",
};
export const TIME_LABEL_NOTE_CLASS = "font-normal normal-case tracking-normal text-[#5A8399]";

const PARTIAL_MESSAGE = "Finish choosing hour, minute, and AM or PM.";

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
  nativeValidity = true,
  label,
  labelNote,
  labelVariant = "default",
}: TimeInputProps) {
  const autoId = useId();
  const baseId = id || autoId;
  const meridiemRef = useRef<HTMLSelectElement>(null);
  const [parts, setParts] = useState<TimeParts>(() => hhmmToParts(value));
  const [syncedValue, setSyncedValue] = useState(value);

  // Sync from parent during render (avoids set-state-in-effect lint).
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

  const showPartial = isPartialTime(parts);

  useLayoutEffect(() => {
    const el = meridiemRef.current;
    if (!el) return;
    if (!nativeValidity) {
      el.setCustomValidity("");
      return;
    }
    el.setCustomValidity(showPartial ? PARTIAL_MESSAGE : "");
  }, [showPartial, nativeValidity]);

  const emit = (next: Partial<TimeParts>) => {
    let merged: TimeParts = {
      hour12: next.hour12 !== undefined ? next.hour12 : parts.hour12,
      minute: next.minute !== undefined ? next.minute : parts.minute,
      meridiem: next.meridiem !== undefined ? next.meridiem : parts.meridiem,
    };
    if (next.hour12 === "") {
      merged = { hour12: "", minute: "", meridiem: "" };
    } else if (next.hour12 && !merged.minute) {
      merged = { ...merged, minute: "00" };
    }
    setParts(merged);
    const hhmm = partsToHhmm(merged.hour12, merged.minute, merged.meridiem);
    if (hhmm !== value) onChange(hhmm);
  };

  const groupLabel = ariaLabel || label || "Time";
  const hintId = `${baseId}-hint`;

  const selects = (
      <div
        // With a label the fieldset is the group (named by its legend); without one this div is.
        role={label ? undefined : "group"}
        aria-label={label ? undefined : groupLabel}
        aria-describedby={!label && showPartial ? hintId : undefined}
        data-time-partial={showPartial ? "true" : undefined}
        className="flex gap-1 min-w-0 w-full sm:w-auto @min-[35rem]:w-auto items-stretch"
      >
        <select
          id={baseId}
          aria-label={`${groupLabel} hour`}
          value={parts.hour12}
          disabled={disabled}
          required={required}
          onChange={(e) => emit({ hour12: e.target.value })}
          style={CHEVRON_STYLE}
          className={`${selectBase} min-w-[3.625rem] sm:w-[4.75rem] @min-[35rem]:w-[4.75rem]`}
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
          style={CHEVRON_STYLE}
          className={`${selectBase} min-w-[4.5rem] sm:w-[5rem] @min-[35rem]:w-[5rem]`}
        >
          <option value="">Minute</option>
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          ref={meridiemRef}
          id={`${baseId}-meridiem`}
          aria-label={`${groupLabel} AM or PM`}
          value={parts.meridiem}
          disabled={disabled}
          required={required}
          onChange={(e) => emit({ meridiem: e.target.value as Meridiem })}
          style={CHEVRON_STYLE}
          className={`${selectBase} min-w-[4.625rem] sm:w-[5.5rem] @min-[35rem]:w-[5.5rem]`}
        >
          <option value="">AM/PM</option>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
  );

  // sm:w-0 + min-w-full keeps the hint from widening the group and pushing End to a new line.
  const hint = showPartial && (
        <p id={hintId} className="mt-1 text-[12px] text-amber-800 sm:w-0 @min-[35rem]:w-0 sm:min-w-full @min-[35rem]:min-w-full">
          {required
            ? "Pick hour, minute, and AM or PM to set this time."
            : "This time is incomplete. Pick hour, minute, and AM or PM, or clear the hour."}
        </p>
  );

  if (!label) {
    return (
      <div className="min-w-0 w-full sm:w-auto @min-[35rem]:w-auto">
        {selects}
        {hint}
      </div>
    );
  }

  return (
    <fieldset
      aria-describedby={showPartial ? hintId : undefined}
      className="min-w-0 w-full sm:w-auto @min-[35rem]:w-auto m-0 p-0 border-0"
    >
      <legend className={`p-0 ${TIME_LABEL_CLASS[labelVariant]}`}>
        {label}
        {labelNote ? <> <span className={TIME_LABEL_NOTE_CLASS}>{labelNote}</span></> : null}
      </legend>
      {selects}
      {hint}
    </fieldset>
  );
}

/**
 * Visible label for the plain text inputs used in approximate time mode, styled to
 * match the TimeInput legend so the swap does not shift the layout.
 */
export function TimeTextLabel({
  htmlFor,
  label,
  labelNote,
}: {
  htmlFor: string;
  label: string;
  labelNote?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={TIME_LABEL_CLASS.default}>
      {label}
      {labelNote ? <> <span className={TIME_LABEL_NOTE_CLASS}>{labelNote}</span></> : null}
    </label>
  );
}

/**
 * Lays out a Start and End pair. Uses a container query so the pair only sits on
 * one line (with "to" between) when the card is at least 560px wide; otherwise the
 * two stack with 12px between and no "to", so "to" never hangs at the end of a line.
 */
export function TimeRangeRow({
  start,
  end,
  after,
  labelVariant = "default",
  id,
  className = "",
}: {
  start: ReactNode;
  end: ReactNode;
  /** Optional extra field after End, such as Spots. It may wrap to its own line. */
  after?: ReactNode;
  labelVariant?: "default" | "micro";
  id?: string;
  className?: string;
}) {
  return (
    <div id={id} className={`@container min-w-0 ${className}`}>
      <div className={`${TIME_RANGE_ROW_CLASS} ${after ? "@min-[35rem]:flex-wrap" : ""}`}>
        {start}
        <TimeRangeTo labelVariant={labelVariant} />
        {end}
        {after}
      </div>
    </div>
  );
}

/**
 * Row layout for a Start and End pair; must sit inside an @container.
 * Start + "to" + End needs about 542px from sm up, so 35rem (560px) leaves margin.
 */
const TIME_RANGE_ROW_CLASS =
  "flex flex-col gap-3 @min-[35rem]:flex-row @min-[35rem]:items-start @min-[35rem]:gap-x-3 @min-[35rem]:gap-y-2 min-w-0";

/** The "to" between Start and End, shown only when the pair is on one line. */
function TimeRangeTo({ labelVariant = "default" }: { labelVariant?: "default" | "micro" }) {
  return (
    <div aria-hidden="true" data-time-range-to="" className="hidden @min-[35rem]:block shrink-0">
      {/* Invisible spacer the height of a legend so "to" lines up with the selects. */}
      <span className={`invisible ${TIME_LABEL_CLASS[labelVariant]}`}>to</span>
      <span className="flex h-10 items-center text-sm text-[#5A8399]">to</span>
    </div>
  );
}
