"use client";

import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "@/components/event-actions/useDialogFocus";

interface DeleteEventConfirmProps {
  eventName: string;
  deleting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirm before deleting an event. "Keep event" gets focus first. */
export default function DeleteEventConfirm({ eventName, deleting = false, onConfirm, onCancel }: DeleteEventConfirmProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useDialogFocus(panelRef, () => {
    if (!deleting) onCancel();
  }, { initialFocusRef: keepRef });

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-[#0D2B35]/50 p-4 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !deleting) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_20px_60px_rgba(8,100,126,0.18)] sm:p-8"
      >
        <h2 id={titleId} className="mb-3 font-serif text-2xl text-[#0D2B35] break-words">
          Delete {eventName}?
        </h2>
        <p id={bodyId} className="mb-6 text-sm leading-relaxed text-[#5A8399]">
          This deletes every slot, signup and invite for this event. You can&apos;t undo this.
        </p>
        <div className="flex gap-3">
          <button
            ref={keepRef}
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="min-h-[44px] flex-1 rounded-xl border-[1.5px] border-[#0E96B0]/30 px-4 py-2.5 text-sm font-semibold text-[#2E5566] transition-all hover:border-[#0E96B0] hover:bg-[#E6F7FB] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E96B0]"
          >
            Keep event
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="min-h-[44px] flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:bg-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            {deleting ? "Deleting…" : "Delete event"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
