"use client";

interface MenuTriggerProps {
  /** Accessible name, e.g. "Options for Women's Side". */
  label: string;
  onOpen: (button: HTMLElement) => void;
  className?: string;
}

/** The quiet grey vertical three dots button used at every level of the
 *  editor (day, section, slot). 44 by 44 points, never red. */
export default function MenuTrigger({ label, onOpen, className = "" }: MenuTriggerProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="menu"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(e.currentTarget);
      }}
      className={`w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0 ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
        <circle cx="12" cy="5" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="12" cy="19" r="2" />
      </svg>
    </button>
  );
}
