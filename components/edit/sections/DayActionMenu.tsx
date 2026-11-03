"use client";

import { groupSessionsForDisplay } from "@/lib/edit-session-classes";
import { DAYS } from "@/components/edit/edit-page-shared";
import ActionMenu, { type ActionMenuItem } from "@/components/ActionMenu";
import MenuStepForm from "@/components/edit/MenuStepForm";
import { reorderStep } from "@/lib/edit-slot-actions";
import { type EditEventCtx } from "@/components/edit/hooks/useEditEvent";

/** Per-day action menu (change date, duplicate, reorder, remove). */
export default function DayActionMenu({ ctx }: { ctx: EditEventCtx }) {
  const {
    changeGroupDate,
    commitCapacityDraft,
    dayMenuButtonEl,
    dayMenuGroupKey,
    dayMenuSecondStep,
    dayMenuSecondStepDate,
    duplicateGroupToDate,
    editingSessionIndex,
    removeDateGroup,
    sessions,
    setDayMenuGroupKey,
    setDayMenuSecondStep,
    setDayMenuSecondStepDate,
    setEditingSessionIndex,
    setReorderGroupKey,
  } = ctx;

  return (
    dayMenuGroupKey && dayMenuButtonEl && (() => {
    const group = groupSessionsForDisplay(sessions).find((g) => g.key === dayMenuGroupKey);
    if (!group) return null;

    const dateStr = group.sessionDate
      ? (() => {
          const [year, month, day] = group.sessionDate.split("-").map(Number);
          return new Date(year, month - 1, day).toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
            year: "numeric",
          });
        })()
      : DAYS[group.dayOfWeek];

    const closeDayMenu = () => {
      setDayMenuGroupKey(null);
      setDayMenuSecondStep(null);
    };

    if (dayMenuSecondStep === "change-date" || dayMenuSecondStep === "duplicate-day") {
      const isChange = dayMenuSecondStep === "change-date";
      const stepTitle = isChange ? "Change date" : "Duplicate day";
      return (
        <ActionMenu
          title={stepTitle}
          items={[]}
          onClose={closeDayMenu}
          buttonElement={dayMenuButtonEl}
          secondStepContent={
            <MenuStepForm
              title={stepTitle}
              helper={
                isChange
                  ? "Every slot on this day moves to the new date."
                  : "Every slot is copied to the new date. Signups stay on the original day."
              }
              confirmLabel={isChange ? "Move" : "Duplicate"}
              confirmDisabled={!dayMenuSecondStepDate}
              onCancel={closeDayMenu}
              onConfirm={() => {
                if (isChange) {
                  if (group.sessionDate) changeGroupDate(group.sessionDate, dayMenuSecondStepDate);
                } else {
                  duplicateGroupToDate(group, dayMenuSecondStepDate);
                }
                closeDayMenu();
              }}
            >
              <input
                type="date"
                autoFocus
                aria-label={isChange ? "New date" : "Copy to date"}
                value={dayMenuSecondStepDate}
                onChange={(e) => setDayMenuSecondStepDate(e.target.value)}
                className="w-full text-sm text-[#0D2B35] px-3 py-2.5 border-[1.5px] border-[#0E96B0] rounded-lg bg-white outline-none"
              />
            </MenuStepForm>
          }
        />
      );
    }

    // Reorder only makes sense when at least two slots share a section.
    const canReorder = group.items.some((_, pos) => reorderStep(group, pos, "down") !== null);
    const reorderItem: ActionMenuItem | null = canReorder
      ? {
          label: "Reorder slots",
          onSelect: () => {
            if (editingSessionIndex !== null) commitCapacityDraft(editingSessionIndex);
            setEditingSessionIndex(null);
            setReorderGroupKey(group.key);
          },
        }
      : null;
    const removeDayItem: ActionMenuItem = {
      label: "Remove day",
      onSelect: () => {
        closeDayMenu();
        removeDateGroup(group);
      },
      tone: "danger",
    };
    // Recurring weekday groups have no calendar date, so only Remove day applies.
    const items: ActionMenuItem[] = group.sessionDate
      ? [
          {
            label: "Change date",
            closeOnSelect: false,
            onSelect: () => {
              setDayMenuSecondStepDate(group.sessionDate || "");
              setDayMenuSecondStep("change-date");
            },
          },
          {
            label: "Duplicate day",
            closeOnSelect: false,
            onSelect: () => {
              const [yy, mm, dd] = group.sessionDate!.split("-").map(Number);
              const nd = new Date(yy, mm - 1, dd);
              nd.setDate(nd.getDate() + 7);
              setDayMenuSecondStepDate(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}-${String(nd.getDate()).padStart(2, "0")}`);
              setDayMenuSecondStep("duplicate-day");
            },
          },
          ...(reorderItem ? [reorderItem] : []),
          removeDayItem,
        ]
      : [...(reorderItem ? [reorderItem] : []), removeDayItem];

    return (
      <ActionMenu
        title={dateStr}
        items={items}
        onClose={closeDayMenu}
        buttonElement={dayMenuButtonEl}
      />
    );
  })()
  );
}
