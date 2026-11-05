"use client";

import Link from "next/link";
import { useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "@/components/event-actions/useDialogFocus";
import { CloseIcon, TrashIcon } from "@/components/event-actions/icons";

export interface EventSheetAction {
  key: string;
  label: string;
  helper: string;
  icon: ReactNode;
  /** Link target. When set the row is a link; otherwise it calls onSelect. */
  href?: string;
  onSelect?: () => void;
}

export interface EventSheetGroup {
  heading: string;
  actions: EventSheetAction[];
}

interface EventActionsSheetProps {
  title: string;
  subtitle?: string | null;
  groups: EventSheetGroup[];
  /** Opens the delete confirm. The sheet closes first. */
  onDelete: () => void;
  onClose: () => void;
  /** The button that opened the sheet; focus goes back to it on close. */
  triggerRef?: RefObject<HTMLElement | null>;
}

const ROW =
  "flex w-full min-h-[50px] items-center gap-3.5 px-5 py-1.5 text-left no-underline transition-colors hover:bg-[#E6F7FB] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0E96B0]";

/** Grouped event actions: a bottom sheet on phones, a centered dialog from 640px up. */
export default function EventActionsSheet({
  title,
  subtitle,
  groups,
  onDelete,
  onClose,
  triggerRef,
}: EventActionsSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subtitleId = useId();
  useDialogFocus(panelRef, onClose, { returnFocusTo: triggerRef });

  if (typeof document === "undefined") return null;

  const visibleGroups = groups.filter((g) => g.actions.length > 0);

  const rowBody = (a: { label: string; helper: string; icon: ReactNode }, danger = false) => (
    <>
      <span className={`flex size-5 flex-shrink-0 ${danger ? "text-red-600" : "text-[#0E96B0]"}`}>{a.icon}</span>
      <span className="min-w-0">
        <span className={`block text-[15px] font-semibold leading-tight ${danger ? "text-red-600" : "text-[#0D2B35]"}`}>
          {a.label}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-[#5A8399]">{a.helper}</span>
      </span>
    </>
  );

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100] bg-[#0D2B35]/40 animate-fade-in" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        className="fixed inset-x-0 bottom-0 z-[101] outline-none max-h-[90dvh] overflow-y-auto rounded-t-2xl bg-white pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_28px_rgba(8,100,126,0.18)] animate-slide-up sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[26rem] sm:max-h-[85vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-3 sm:shadow-[0_20px_60px_rgba(8,100,126,0.18)]"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[#0E96B0]/20 sm:hidden" aria-hidden />
        <div className="flex items-start gap-3 border-b border-[#0E96B0]/12 px-5 pb-3 pt-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold leading-snug text-[#0D2B35] break-words">
              {title}
            </h2>
            {subtitle && (
              <p id={subtitleId} className="mt-0.5 text-[13px] text-[#5A8399]">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 inline-flex size-11 flex-shrink-0 items-center justify-center rounded-xl text-[#5A8399] hover:bg-[#E6F7FB] hover:text-[#0D2B35] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E96B0]"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>

        {visibleGroups.map((group) => {
          const headingId = `${titleId}-${group.heading.toLowerCase().replace(/\s+/g, "")}`;
          return (
            <div key={group.heading} role="group" aria-labelledby={headingId} className="pt-2">
              <h3
                id={headingId}
                className="px-5 pb-1 text-[11px] font-semibold uppercase tracking-[0.6px] text-[#5A8399]"
              >
                {group.heading}
              </h3>
              <ul className="list-none p-0 m-0">
                {group.actions.map((a) => (
                  <li key={a.key}>
                    {a.href ? (
                      <Link href={a.href} className={ROW} onClick={onClose}>
                        {rowBody(a)}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className={ROW}
                        onClick={() => {
                          onClose();
                          a.onSelect?.();
                        }}
                      >
                        {rowBody(a)}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        <div className="mx-5 mt-2 border-t border-[#0E96B0]/12" role="separator" />
        <div className="pt-1">
          <button
            type="button"
            className={`${ROW} hover:bg-red-50`}
            onClick={() => {
              onClose();
              onDelete();
            }}
          >
            {rowBody({ label: "Delete event", helper: "Removes all slots and signups", icon: <TrashIcon className="size-5" /> }, true)}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

/** "Sunday, June 15 · 5 of 12 spots filled". Date is optional (YYYY-MM-DD). */
export function eventSheetSubtitle({
  ymd,
  isItems,
  filled,
  total,
}: {
  ymd?: string | null;
  isItems: boolean;
  filled: number;
  total: number;
}): string {
  const parts: string[] = [];
  if (ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, m, d] = ymd.split("-").map(Number);
    parts.push(
      new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }),
    );
  }
  if (isItems) {
    parts.push(`${filled} of ${total} items claimed`);
  } else if (total >= 999) {
    parts.push(`${filled} signed up`);
  } else {
    parts.push(`${filled} of ${total} spots filled`);
  }
  return parts.join(" · ");
}
