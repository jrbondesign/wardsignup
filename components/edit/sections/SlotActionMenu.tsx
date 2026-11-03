"use client";

import { formatTimeRange } from "@/lib/utils";
import ActionMenu from "@/components/ActionMenu";
import { type EditEventCtx } from "@/components/edit/hooks/useEditEvent";

/** Per-slot action menu. */
export default function SlotActionMenu({ ctx }: { ctx: EditEventCtx }) {
  const {
    commitCapacityDraft,
    duplicateSession,
    removeSession,
    sessions,
    setEditingSessionIndex,
    setSlotMenuIndex,
    slotMenuButtonEl,
    slotMenuIndex,
  } = ctx;

  return (
    slotMenuIndex !== null && slotMenuButtonEl && (() => {
    const session = sessions[slotMenuIndex];
    if (!session) return null;

    const name = (session.label ?? "").trim() || formatTimeRange(session.time, session.end_time);

    return (
      <ActionMenu
        title={name}
        items={[
          {
            label: "Edit slot",
            onSelect: () => {
              setSlotMenuIndex(null);
              setEditingSessionIndex((cur) => {
                if (cur !== null && cur !== slotMenuIndex) {
                  commitCapacityDraft(cur);
                }
                return slotMenuIndex;
              });
            },
          },
          {
            label: "Duplicate slot",
            onSelect: () => {
              setSlotMenuIndex(null);
              duplicateSession(slotMenuIndex);
            },
          },
          {
            label: "Remove slot",
            onSelect: () => {
              setSlotMenuIndex(null);
              removeSession(slotMenuIndex);
            },
            tone: "danger",
          },
        ]}
        onClose={() => setSlotMenuIndex(null)}
        buttonElement={slotMenuButtonEl}
      />
    );
  })()
  );
}
