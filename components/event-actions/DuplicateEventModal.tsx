"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useDialogFocus } from "@/components/event-actions/useDialogFocus";
import { createClientComponentClient } from "@/lib/auth";
import { diffDays } from "@/lib/date-shift";

export interface DuplicateTarget {
  id: string;
  name: string;
  anchorDate: string | null;
}

interface DuplicateModalProps {
  eventName: string;
  anchorDate: string | null;
  duplicating: boolean;
  onConfirm: (name: string, newStartDate: string) => void;
  onCancel: () => void;
}

function DuplicateModal({ eventName, anchorDate, duplicating, onConfirm, onCancel }: DuplicateModalProps) {
  const [name, setName] = useState(`Copy of ${eventName}`);
  const [newStart, setNewStart] = useState("");

  const shiftDays =
    anchorDate && /^\d{4}-\d{2}-\d{2}$/.test(newStart)
      ? (diffDays(anchorDate, newStart) ?? 0)
      : 0;
  const showShiftHint = anchorDate && newStart && shiftDays !== 0;
  const panelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  useDialogFocus(panelRef, () => {
    if (!duplicating) onCancel();
  }, { initialFocusRef: nameRef });

  // Every control disables while duplicating, which would drop focus to <body>; keep it on the dialog.
  useEffect(() => {
    const panel = panelRef.current;
    if (!duplicating || !panel) return;
    const active = document.activeElement as HTMLInputElement | HTMLButtonElement | null;
    if (!active || !panel.contains(active) || active.disabled) panel.focus();
  }, [duplicating]);

  return (
    <div className="fixed inset-0 bg-[#0D2B35]/50 backdrop-blur-[2px] flex items-center justify-center p-4 z-[1150]">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={duplicating || undefined}
        tabIndex={-1}
        className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(8,100,126,0.18)] max-w-md w-full max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain p-6 sm:p-8 outline-none"
      >
        <h2 id={titleId} className="font-serif text-2xl text-[#0D2B35] mb-2">Duplicate Event</h2>
        <p className="text-sm text-[#5A8399] leading-relaxed mb-5">
          Creates a copy of <strong className="text-[#0D2B35] font-semibold">{eventName}</strong> with all its
          spots and items, but no signups. You can fine-tune everything afterward.
        </p>

        <label className="block text-xs font-semibold text-[#2E5566] mb-1.5">New event name</label>
        <input
          ref={nameRef}
          type="text"
          aria-label="New event name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={duplicating}
          className="w-full text-sm px-3 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/25 focus:border-[#0E96B0] focus:outline-none mb-5 disabled:opacity-60"
        />

        {anchorDate && (
          <>
            <label className="block text-xs font-semibold text-[#2E5566] mb-1.5">
              New start date <span className="font-normal text-[#5A8399]">(optional)</span>
            </label>
            <input
              type="date"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              disabled={duplicating}
              className="w-full text-sm px-3 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/25 focus:border-[#0E96B0] focus:outline-none disabled:opacity-60"
            />
            <p className="text-[11px] text-[#5A8399] mt-1.5 leading-snug">
              {showShiftHint
                ? `All dates shift by ${shiftDays > 0 ? "+" : ""}${shiftDays} day${Math.abs(shiftDays) === 1 ? "" : "s"} (original starts ${anchorDate}).`
                : `Leave blank to keep the same dates. The original starts ${anchorDate}.`}
            </p>
          </>
        )}

        <div className="flex gap-3 mt-7">
          <button
            onClick={onCancel}
            disabled={duplicating}
            className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/30 text-[#2E5566] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(name.trim(), newStart)}
            disabled={duplicating || !name.trim()}
            className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.35)] hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {duplicating ? "Duplicating…" : "Duplicate"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Duplicate event flow shared by the dashboard card sheet and the event page sheet:
 * the name and new start date modal, then POST /api/events/{id}/duplicate and
 * land on the new event's edit page.
 */
export function useDuplicateEvent({
  router,
  posthog,
}: {
  router: { push: (href: string) => void };
  posthog?: { capture: (event: string, props?: Record<string, unknown>) => void } | null;
}): { openDuplicate: (target: DuplicateTarget) => void; duplicateDialog: ReactNode } {
  const [duplicateModal, setDuplicateModal] = useState<DuplicateTarget | null>(null);
  const [duplicating, setDuplicating] = useState(false);

  const handleDuplicate = async (name: string, newStartDate: string) => {
    if (!duplicateModal) return;

    setDuplicating(true);
    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`/api/events/${duplicateModal.id}/duplicate`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, new_start_date: newStartDate || undefined }),
      });

      const bodyJson = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(bodyJson?.error || "Failed to duplicate event");
      }

      posthog?.capture("event_duplicated", {
        source_event_id: duplicateModal.id,
        event_id: bodyJson?.event?.id,
      });
      setDuplicateModal(null);
      // Land on the edit page so the organizer can review and fine-tune dates.
      router.push(`/edit/${bodyJson.event.id}`);
    } catch (error: unknown) {
      alert((error instanceof Error && error.message) || "Failed to duplicate event");
      setDuplicating(false);
    }
  };

  const duplicateDialog = duplicateModal ? (
    <DuplicateModal
      eventName={duplicateModal.name}
      anchorDate={duplicateModal.anchorDate}
      duplicating={duplicating}
      onConfirm={handleDuplicate}
      onCancel={() => setDuplicateModal(null)}
    />
  ) : null;

  return { openDuplicate: setDuplicateModal, duplicateDialog };
}
