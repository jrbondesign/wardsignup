"use client";

import { useEffect, useRef, useState } from "react";
import { formatTime, parseLooseTime } from "@/lib/utils";

interface TimeInputProps {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
  id?: string;
}

/**
 * Time input that accepts loose strings ("4pm", "9:30am", "1430") and stores
 * a canonical 24-hour "HH:MM" value via `onChange`. The displayed text follows
 * the user's locale ("4:00 PM" or "16:00" depending on browser/system) when
 * the field is not focused. While focused, we show whatever the user is
 * typing so they can edit freely.
 */
export default function TimeInput({
  value,
  onChange,
  className,
  placeholder = "e.g. 4pm",
  disabled,
  required,
  ariaLabel,
  id,
}: TimeInputProps) {
  const [draft, setDraft] = useState(value ? formatTime(value) : "");
  const [focused, setFocused] = useState(false);
  const lastValueRef = useRef(value);

  // When the parent's canonical value changes (and we're NOT actively editing),
  // refresh the displayed text to match.
  useEffect(() => {
    if (!focused && value !== lastValueRef.current) {
      setDraft(value ? formatTime(value) : "");
      lastValueRef.current = value;
    }
  }, [value, focused]);

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      if (value !== "") onChange("");
      lastValueRef.current = "";
      return;
    }
    const parsed = parseLooseTime(trimmed);
    if (parsed) {
      if (parsed !== value) onChange(parsed);
      // After blur, snap displayed text to locale-formatted version.
      setDraft(formatTime(parsed));
      lastValueRef.current = parsed;
    } else {
      // Unparseable — revert to whatever's canonically stored so we never persist junk.
      setDraft(value ? formatTime(value) : "");
    }
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => {
        setFocused(true);
        // Show raw HH:MM on focus so the user can edit minutes precisely,
        // and select-all so typing replaces instead of inserting beside cursor.
        const el = e.currentTarget;
        if (value) setDraft(value);
        // Defer selection so it happens after the draft re-render swaps the value.
        requestAnimationFrame(() => el.select());
      }}
      onBlur={() => { setFocused(false); commit(); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur(); } }}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      aria-label={ariaLabel}
      className={className}
    />
  );
}
