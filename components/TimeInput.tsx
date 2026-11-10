"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { formatTime12h } from "@/lib/utils";

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
   * Visible legend text, e.g. "Start time". When set, the field is wrapped in a
   * fieldset with this legend so it is labelled on screen and for screen readers.
   */
  label?: string;
  /** Lighter sublabel after the legend, e.g. "(required)" or "(optional)". */
  labelNote?: string;
  /** "micro" matches the small uppercase labels in the sessions list. */
  labelVariant?: "default" | "micro";
  /** Inline error shown under the field (e.g. End before Start); marks it invalid. */
  error?: string;
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
const QUARTER_MINUTES = ["00", "15", "30", "45"];
const FIVE_MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

/**
 * Minute buttons for the sheet. Quarter hours by default, every 5 minutes on
 * request. A saved minute that is on neither list (for example 7:07) is added
 * so it shows as selected and is kept unless the person picks another one.
 */
export function minuteChoices(current: string, showAll: boolean): string[] {
  const base = showAll ? FIVE_MINUTES : QUARTER_MINUTES;
  if (!current || base.includes(current)) return base;
  return [...base, current].sort((a, b) => Number(a) - Number(b));
}

/** Shared legend styles so every time field reads the same. */
export const TIME_LABEL_CLASS: Record<"default" | "micro", string> = {
  default: "block text-[13px] leading-5 font-semibold text-[#2E5566] tracking-[0.2px] mb-1",
  micro: "block text-[11px] leading-4 font-semibold text-[#5A8399] uppercase tracking-[0.4px] mb-1",
};
export const TIME_LABEL_NOTE_CLASS = "font-normal normal-case tracking-normal text-[#5A8399]";

const PARTIAL_MESSAGE = "Finish choosing hour, minute, and AM or PM.";

/**
 * The closed field: one button sized like the other inputs (44px on phones,
 * 40px from sm up). Width is fixed from sm up so a Start and End pair fits on
 * one line in a 560px card.
 */
const triggerBase =
  "group/time flex items-center gap-2 w-full sm:w-[11.5rem] @min-[35rem]:w-[11.5rem] min-w-0 h-11 sm:h-10 @min-[35rem]:h-10 pl-3 pr-2 text-left text-sm rounded-xl bg-white outline-none transition-all border-[1.5px] border-[rgba(14,150,176,0.22)] hover:border-[#0E96B0] focus-visible:border-[#0E96B0] focus-visible:shadow-[0_0_0_3px_rgba(14,150,176,0.18)] aria-invalid:border-red-400 disabled:opacity-60 disabled:cursor-not-allowed touch-manipulation";

/** Chip used for AM/PM, hours and minutes. Selected = light fill, never the solid primary. */
function chipClass(selected: boolean, extra = ""): string {
  return [
    "relative inline-flex items-center justify-center min-h-11 min-w-11 rounded-xl border-[1.5px] text-[15px] tabular-nums transition-colors touch-manipulation outline-none focus-visible:shadow-[0_0_0_3px_rgba(14,150,176,0.25)]",
    selected
      ? "bg-[#E6F7FB] border-[#0E96B0] text-[#08647E] font-semibold"
      : "bg-white border-[rgba(14,150,176,0.22)] text-[#0D2B35] hover:border-[#0E96B0]",
    extra,
  ].join(" ");
}

function Check() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="w-3.5 h-3.5 mr-1 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="w-4 h-4 shrink-0 text-[#5A8399]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 6v4l2.5 1.5" />
    </svg>
  );
}

/** Focusable elements inside the sheet, in DOM order, for the focus trap. */
function focusables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')
  );
}

/**
 * Time field that opens a bottom sheet (Option A): AM and PM toggle, hour
 * buttons 1 to 12, minutes at :00 :15 :30 :45 (every 5 on request), and one
 * Set button. Nothing is typed and no native picker opens.
 *
 * Stores the same 24-hour "HH:MM" string the rest of the app expects. Picks
 * inside the sheet are a draft; only Set changes the value, so the saved value
 * is never half filled. While a draft is incomplete the wrapper carries
 * data-time-partial="true" (the same flag edit forms check before saving).
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
  error,
}: TimeInputProps) {
  const autoId = useId();
  const baseId = id || autoId;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const validityRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TimeParts>(() => hhmmToParts(value));
  const [showAllMinutes, setShowAllMinutes] = useState(false);
  const [missing, setMissing] = useState(false);

  const draftHhmm = partsToHhmm(draft.hour12, draft.minute, draft.meridiem);
  const showPartial = open && isPartialTime(draft);
  const display = value ? formatTime12h(value) : "";
  const groupLabel = ariaLabel || label || "Time";
  const sheetTitle = label || ariaLabel || "Time";
  const titleId = `${baseId}-sheet-title`;
  const previewId = `${baseId}-sheet-preview`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const missingId = `${baseId}-missing`;
  const showMissing = missing && !value && !!required;

  // Keep the hidden validity input in step: partial draft → custom message,
  // blank + required → native valueMissing (set by the required attribute).
  useLayoutEffect(() => {
    const el = validityRef.current;
    if (!el) return;
    el.setCustomValidity(nativeValidity && showPartial ? PARTIAL_MESSAGE : "");
  }, [showPartial, nativeValidity]);

  const openSheet = () => {
    if (disabled) return;
    const parts = hhmmToParts(value);
    setDraft(parts);
    // Start on the 5 minute grid when the saved minute is not a quarter hour.
    setShowAllMinutes(!!parts.minute && !QUARTER_MINUTES.includes(parts.minute) && FIVE_MINUTES.includes(parts.minute));
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    // Return focus to the field the sheet came from.
    triggerRef.current?.focus();
  };

  const cancel = () => {
    setDraft(hhmmToParts(value));
    close();
  };

  const commit = () => {
    if (!draftHhmm) return;
    if (draftHhmm !== value) onChange(draftHhmm);
    setMissing(false);
    close();
  };

  const clear = () => {
    if (value !== "") onChange("");
    setDraft({ hour12: "", minute: "", meridiem: "" });
    close();
  };

  const pickHour = (h: string) =>
    setDraft((d) => ({ ...d, hour12: h, minute: d.minute || "00" }));
  const pickMinute = (m: string) => setDraft((d) => ({ ...d, minute: m }));
  const pickMeridiem = (m: Meridiem) => setDraft((d) => ({ ...d, meridiem: m }));

  // Focus the selected hour (or the first hour) when the sheet opens; lock the page behind it.
  useEffect(() => {
    if (!open) return;
    const root = dialogRef.current;
    const target =
      root?.querySelector<HTMLElement>('[data-sheet-hour][aria-pressed="true"]') ??
      root?.querySelector<HTMLElement>("[data-sheet-hour]");
    target?.focus();
    const body = document.body;
    const html = document.documentElement;
    const prevBody = body.style.overflow;
    const prevHtml = html.style.overflow;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    return () => {
      body.style.overflow = prevBody;
      html.style.overflow = prevHtml;
    };
  }, [open]);

  const onSheetKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
      return;
    }
    if (e.key === "Tab") {
      const items = focusables(dialogRef.current);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    // Arrow keys move inside a group (AM/PM, hours, minutes).
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      const active = document.activeElement as HTMLElement | null;
      const group = active?.closest<HTMLElement>("[data-sheet-group]");
      if (!group) return;
      const buttons = Array.from(group.querySelectorAll<HTMLElement>("button"));
      const i = buttons.indexOf(active as HTMLElement);
      if (i < 0) return;
      e.preventDefault();
      const step = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
      buttons[(i + step + buttons.length) % buttons.length]?.focus();
      return;
    }
    // Quick keys on desktop: "a" or "p" picks AM or PM.
    if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "a") pickMeridiem("AM");
      else if (k === "p") pickMeridiem("PM");
    }
  };

  const describedBy =
    [showPartial ? hintId : "", error ? errorId : "", showMissing ? missingId : ""].filter(Boolean).join(" ") ||
    undefined;

  const previewText = draft.hour12
    ? `${draft.hour12}:${draft.minute || "00"} ${draft.meridiem || ""}`.trim()
    : "Pick a time";
  const minutes = minuteChoices(draft.minute, showAllMinutes);

  // open only turns true from a click, so document exists when the portal renders.
  const sheet = open
    ? createPortal(
        <div className="fixed inset-0 z-[300]" data-time-sheet="">
          <div
            aria-hidden="true"
            data-testid="time-sheet-backdrop"
            className="absolute inset-0 bg-[rgba(13,43,53,0.45)] animate-fade-in"
            onClick={cancel}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={previewId}
            onKeyDown={onSheetKeyDown}
            className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto overscroll-contain bg-white rounded-t-[20px] shadow-[0_-8px_28px_rgba(8,100,126,0.22)] px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] sm:inset-x-auto sm:left-1/2 sm:bottom-auto sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[24rem] sm:rounded-[20px] sm:pb-4"
          >
            <div aria-hidden="true" className="mx-auto mb-2 h-1 w-10 rounded-full bg-[rgba(14,150,176,0.22)] sm:hidden" />
            <div className="flex items-center justify-between gap-3">
              <h2 id={titleId} className="text-[15px] font-semibold text-[#0D2B35] truncate">
                {sheetTitle}
              </h2>
              <button
                type="button"
                onClick={cancel}
                className="min-h-11 px-2 -mr-2 text-sm font-semibold text-[#0E96B0] rounded-lg touch-manipulation outline-none focus-visible:shadow-[0_0_0_3px_rgba(14,150,176,0.25)]"
              >
                Cancel
              </button>
            </div>

            <p
              id={previewId}
              aria-live="polite"
              className={`mt-1 text-center text-[32px] leading-10 font-semibold tabular-nums ${draft.hour12 ? "text-[#0D2B35]" : "text-[#5A8399]"}`}
            >
              {previewText}
            </p>

            <div role="group" aria-label="AM or PM" data-sheet-group="" className="mt-3 grid grid-cols-2 gap-2">
              {(["AM", "PM"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={draft.meridiem === m}
                  onClick={() => pickMeridiem(m)}
                  className={chipClass(draft.meridiem === m, "h-11")}
                >
                  {draft.meridiem === m && <Check />}
                  {m}
                </button>
              ))}
            </div>

            <p className="mt-4 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.4px] text-[#5A8399]" aria-hidden="true">
              Hour
            </p>
            <div role="group" aria-label="Hour" data-sheet-group="" className="grid grid-cols-6 gap-1.5">
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  data-sheet-hour=""
                  aria-pressed={draft.hour12 === h}
                  aria-label={`${h} o'clock`}
                  onClick={() => pickHour(h)}
                  className={chipClass(draft.hour12 === h, "px-0")}
                >
                  {h}
                </button>
              ))}
            </div>

            <p className="mt-4 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.4px] text-[#5A8399]" aria-hidden="true">
              Minute
            </p>
            <div
              role="group"
              aria-label="Minute"
              data-sheet-group=""
              className={`grid gap-1.5 ${minutes.length > 5 ? "grid-cols-6" : minutes.length === 5 ? "grid-cols-5" : "grid-cols-4"}`}
            >
              {minutes.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={draft.minute === m}
                  aria-label={`${m} minutes`}
                  onClick={() => pickMinute(m)}
                  className={chipClass(draft.minute === m, "px-0")}
                >
                  :{m}
                </button>
              ))}
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <button
                type="button"
                aria-expanded={showAllMinutes}
                onClick={() => setShowAllMinutes((s) => !s)}
                className="min-h-11 text-[13px] font-semibold text-[#0E96B0] underline-offset-2 hover:underline touch-manipulation outline-none focus-visible:underline"
              >
                {showAllMinutes ? "Show quarter hours" : "Show every 5 minutes"}
              </button>
              {!required && value ? (
                <button
                  type="button"
                  onClick={clear}
                  className="min-h-11 text-[13px] font-semibold text-[#5A8399] underline-offset-2 hover:underline touch-manipulation outline-none focus-visible:underline"
                >
                  Clear time
                </button>
              ) : null}
            </div>

            {showPartial && (
              <p className="mt-1 text-[12px] text-amber-800">
                {draft.hour12 && !draft.meridiem ? "Choose AM or PM to set this time." : PARTIAL_MESSAGE}
              </p>
            )}

            <button
              type="button"
              onClick={commit}
              disabled={!draftHhmm}
              className="mt-3 w-full min-h-12 text-base font-semibold px-4 rounded-xl text-white bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] shadow-[0_4px_14px_rgba(14,150,176,0.30)] touch-manipulation disabled:opacity-50 disabled:shadow-none outline-none focus-visible:shadow-[0_0_0_3px_rgba(14,150,176,0.35)]"
            >
              {draftHhmm ? `Set ${formatTime12h(draftHhmm)}` : "Set time"}
            </button>
          </div>
        </div>,
        document.body
      )
    : null;

  const field = (
    <div
      // With a label the fieldset is the group (named by its legend); without one this div is.
      role={label ? undefined : "group"}
      aria-label={label ? undefined : groupLabel}
      data-time-partial={showPartial ? "true" : undefined}
      data-time-value={value || ""}
      className="relative min-w-0 w-full sm:w-auto @min-[35rem]:w-auto"
    >
      <button
        ref={triggerRef}
        id={baseId}
        type="button"
        data-time-trigger=""
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${groupLabel}, ${display || "not set"}`}
        aria-invalid={error || showMissing ? true : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={openSheet}
        className={triggerBase}
      >
        <ClockIcon />
        <span className={`flex-1 min-w-0 truncate tabular-nums ${display ? "text-[#0D2B35]" : "text-[#5A8399]"}`}>
          {display || "Choose time"}
        </span>
        <span aria-hidden="true" className="shrink-0 text-[12px] font-semibold text-[#0E96B0]">
          {display ? "Change" : "Set"}
        </span>
      </button>
      {/*
        Hidden stand-in for native form validation: required + blank blocks a
        native submit, and a partial draft sets a custom message. Matches the
        old select:invalid behavior that edit forms check before saving.
      */}
      <input
        ref={validityRef}
        type="text"
        tabIndex={-1}
        aria-hidden="true"
        data-time-validity=""
        value={value}
        onChange={() => {}}
        required={required}
        disabled={disabled}
        onInvalid={(e) => {
          // Native form submit hit a blank required time: show our own note on
          // the field instead of a browser bubble on this hidden input.
          e.preventDefault();
          if (open) return;
          if (!value) setMissing(true);
          triggerRef.current?.focus();
        }}
        className="sr-only"
      />
    </div>
  );

  // sm:w-0 + min-w-full keeps a note from widening the field and pushing End to a new line.
  const noteWidth = "sm:w-0 @min-[35rem]:w-0 sm:min-w-full @min-[35rem]:min-w-full";
  const hint = showPartial && (
    <p id={hintId} className={`sr-only`}>
      {PARTIAL_MESSAGE}
    </p>
  );
  const missingNote = showMissing ? (
    <p id={missingId} className={`mt-1 text-[12px] text-red-700 ${noteWidth}`}>
      Choose a {(label || "time").toLowerCase()}.
    </p>
  ) : null;
  const errorNote = error ? (
    <p id={errorId} className={`mt-1 text-[12px] text-red-700 ${noteWidth}`}>
      {error}
    </p>
  ) : null;

  if (!label) {
    return (
      <div className="min-w-0 w-full sm:w-auto @min-[35rem]:w-auto">
        {field}
        {hint}
        {missingNote}
        {errorNote}
        {sheet}
      </div>
    );
  }

  return (
    <fieldset
      aria-describedby={describedBy}
      className="min-w-0 w-full sm:w-auto @min-[35rem]:w-auto m-0 p-0 border-0"
    >
      <legend className={`p-0 ${TIME_LABEL_CLASS[labelVariant]}`}>
        {label}
        {labelNote ? <> <span className={TIME_LABEL_NOTE_CLASS}>{labelNote}</span></> : null}
      </legend>
      {field}
      {hint}
      {missingNote}
      {errorNote}
      {sheet}
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
