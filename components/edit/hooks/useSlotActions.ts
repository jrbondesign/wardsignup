"use client";

import { formatTimeRange } from "@/lib/utils";
import { applyCapacityDrafts, duplicateSessionAfter, removeDayConfirmBody, removeSection, removeSectionConfirmBody, removeSlotConfirmBody, renameSection, reorderSessions, sectionSlotIndices } from "@/lib/edit-slot-actions";
import { DAYS, SessionData } from "@/components/edit/edit-page-shared";
import { type EditEventState } from "./useEditEventState";
import { type EditEventSettings } from "./useEditEventSettings";
import { type ScheduleBuilders } from "./useScheduleBuilders";

/** Per-slot, per-day and per-section edits on the in-memory schedule. */
export function useSlotActions(ctx: EditEventState & EditEventSettings & ScheduleBuilders) {
  const {
    capacityInputDraft,
    sessions,
    setCapacityInputDraft,
    setConfirmDialog,
    setEditingSessionIndex,
    setSessions,
    setShowToast,
    setToastMessage,
    signupsBySession,
  } = ctx;

  const removeSession = (index: number) => {
    const session = sessions[index];
    if (!session) return;

    const id = session.id;
    const n = id ? signupsBySession[id] ?? 0 : 0;

    if (n > 0) {
      const name = (session.label ?? "").trim() || formatTimeRange(session.time, session.end_time);
      setConfirmDialog({
        title: `Remove ${name}?`,
        body: removeSlotConfirmBody(n),
        confirmLabel: "Remove slot",
        onConfirm: () => {
          dropSessionAt(index);
          setConfirmDialog(null);
        },
      });
    } else {
      dropSessionAt(index);
    }
  };

  /** Remove one slot and keep the open editor pointing at the same slot
   *  (indices after the removed one shift down by one). */
  const dropSessionAt = (index: number) => {
    setSessions((prev) => prev.filter((_, i) => i !== index));
    setCapacityInputDraft({});
    setEditingSessionIndex((cur) =>
      cur === null || cur === index ? null : cur > index ? cur - 1 : cur,
    );
  };

  /** Remove every session on one date (takes effect on Save). */
  const removeDateGroup = (group: { sessionDate: string | null; dayOfWeek: number; items: { index: number }[] }) => {
    const n = group.items.length;
    const people = group.items.reduce((sum, it) => {
      const id = sessions[it.index]?.id;
      return sum + (id ? signupsBySession[id] ?? 0 : 0);
    }, 0);

    const dateStr = group.sessionDate
      ? (() => {
          const [year, month, day] = group.sessionDate.split("-").map(Number);
          return new Date(year, month - 1, day).toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
          });
        })()
      : DAYS[group.dayOfWeek];

    const body = removeDayConfirmBody(n, people);

    setConfirmDialog({
      title: `Remove ${dateStr}?`,
      body,
      confirmLabel: "Remove day",
      onConfirm: () => {
        const drop = new Set(group.items.map((it) => it.index));
        setSessions((prev) => prev.filter((_, i) => !drop.has(i)));
        setCapacityInputDraft({});
        setEditingSessionIndex(null);
        setConfirmDialog(null);
      },
    });
  };

  /** Add another class slot to an existing date, copying that date's time/location
   *  so the organizer only needs to name it. Opens the new row's editor. */
  const addClassToDate = (group: {
    sessionDate: string | null;
    dayOfWeek: number;
    items: { session: SessionData }[];
  }) => {
    const first = group.items[0]?.session;
    const newIndex = sessions.length;
    setSessions([
      ...sessions,
      {
        day_of_week: group.dayOfWeek,
        time: first?.time || "19:00",
        end_time: first?.end_time,
        capacity: first?.capacity ?? 1,
        location: first?.location || "",
        notes: "",
        session_date: group.sessionDate || undefined,
        label: "",
        section: first?.section || "",
      },
    ]);
    setEditingSessionIndex(newIndex);
  };

  /** Move every class on a given date to a new date, preserving each session's
   *  section, label, time, capacity, and notes. day_of_week is recomputed so it
   *  stays consistent with the new calendar date. */
  const changeGroupDate = (oldDate: string, newYmd: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newYmd) || newYmd === oldDate) return;
    const [y, m, d] = newYmd.split("-").map(Number);
    const newDow = new Date(y, m - 1, d).getDay();
    setSessions((prev) =>
      prev.map((s) =>
        (s.session_date ?? "") === oldDate
          ? { ...s, session_date: newYmd, day_of_week: newDow }
          : s,
      ),
    );
  };

  /** Duplicate every class on a date (all sections, labels, times, capacities,
   *  and locations) onto a new date — only the date changes. New copies get no
   *  id so they're inserted as fresh slots on save. */
  const duplicateGroupToDate = (
    group: { items: { session: SessionData }[] },
    newYmd: string,
  ) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newYmd)) return;
    const [y, m, d] = newYmd.split("-").map(Number);
    const newDow = new Date(y, m - 1, d).getDay();
    // Place clones after all existing slots, in the source day's visible order,
    // so the copied day preserves that order (sort_order is renumbered on save).
    const maxSort = sessions.reduce((mx, s) => Math.max(mx, s.sort_order ?? 0), 0);
    const clones: SessionData[] = group.items.map(({ session }, i) => ({
      day_of_week: newDow,
      time: session.time,
      end_time: session.end_time,
      capacity: session.capacity,
      location: session.location,
      notes: session.notes,
      session_date: newYmd,
      label: session.label,
      section: session.section,
      sort_order: maxSort + 1 + i,
    }));
    setSessions((prev) => [...prev, ...clones]);
    setToastMessage(
      `Duplicated ${clones.length} slot${clones.length === 1 ? "" : "s"} to the new date`,
    );
  };

  /** Drag-reorder: move the slot at `fromIndex` to just before the slot at
   *  `toIndex` (same date only), then renumber sort_order across all slots by
   *  the resulting display order so it persists on save. */
  const reorderSlot = (fromIndex: number, toIndex: number) => {
    setSessions((prev) => reorderSessions(prev, fromIndex, toIndex));
  };

  /** Duplicate every class in a section on a date as a new, distinctly-named
   *  section on that same date — a fast way to mirror a whole side (e.g. build
   *  "Men's Side", duplicate it, rename the copy to "Women's Side"). Copies are
   *  new rows (no id), so they save as inserts and start with no signups. */
  const duplicateSection = (
    group: { sessionDate: string | null; items: { session: SessionData }[] },
    sectionKey: string,
  ) => {
    const inSection = group.items
      .map(({ session }) => session)
      .filter((s) => (s.section ?? "").trim() === sectionKey);
    if (inSection.length === 0) return;

    const taken = new Set(sessions.map((s) => (s.section ?? "").trim()));
    let name = `${sectionKey} copy`;
    let n = 2;
    while (taken.has(name)) name = `${sectionKey} copy ${n++}`;

    const copies: SessionData[] = inSection.map((s) => ({
      day_of_week: s.day_of_week,
      time: s.time,
      end_time: s.end_time,
      capacity: s.capacity,
      location: s.location,
      notes: s.notes,
      session_date: s.session_date,
      label: s.label,
      section: name,
    }));
    setSessions([...sessions, ...copies]);
    setToastMessage(`Duplicated ${sectionKey} as ${name}`);
    setShowToast(true);
  };

  /** Rename a section on one day (staged until Save). */
  const renameSectionOnDay = (groupKey: string, section: string, newName: string) => {
    setSessions((prev) => renameSection(prev, groupKey, section, newName));
  };

  /** Remove every slot in a section on one day, after an in app confirm. */
  const removeSectionOnDay = (groupKey: string, section: string) => {
    const indices = sectionSlotIndices(sessions, groupKey, section);
    if (indices.length === 0) return;
    const people = indices.reduce((sum, i) => {
      const id = sessions[i]?.id;
      return sum + (id ? signupsBySession[id] ?? 0 : 0);
    }, 0);
    setConfirmDialog({
      title: `Remove ${section}?`,
      body: removeSectionConfirmBody(indices.length, people),
      confirmLabel: "Remove section",
      onConfirm: () => {
        setSessions((prev) => removeSection(prev, groupKey, section));
        setCapacityInputDraft({});
        setEditingSessionIndex(null);
        setConfirmDialog(null);
      },
    });
  };

  /** Duplicate a single slot right below the original, then open the copy for
   *  editing. Any pending Spots draft is committed first so the copy (and the
   *  original) carry the number the organizer typed. */
  const duplicateSession = (index: number) => {
    const base = applyCapacityDrafts(sessions, capacityInputDraft);
    const result = duplicateSessionAfter(base, index);
    if (!result) return;
    setCapacityInputDraft({});
    setSessions(result.sessions);
    setEditingSessionIndex(result.copyIndex);

    const original = base[index];
    const name = (original.label ?? "").trim() || formatTimeRange(original.time, original.end_time);
    setToastMessage(`Duplicated ${name}`);
    setShowToast(true);
  };

  const updateSession = (index: number, field: keyof SessionData, value: string | number) => {
    const updated = [...sessions];
    updated[index] = { ...updated[index], [field]: value };
    setSessions(updated);
  };

  const commitCapacityDraft = (index: number) => {
    setCapacityInputDraft((d) => {
      const raw = d[index];
      if (raw === undefined) return d;
      const n = parseInt(raw, 10);
      const final = raw === "" || !Number.isFinite(n) || n < 1 ? 1 : n;
      const next = { ...d };
      delete next[index];
      queueMicrotask(() => {
        setSessions((prev) => {
          const updated = [...prev];
          if (updated[index]) {
            updated[index] = { ...updated[index], capacity: final };
          }
          return updated;
        });
      });
      return next;
    });
  };

  return {
    removeSession,
    dropSessionAt,
    removeDateGroup,
    addClassToDate,
    changeGroupDate,
    duplicateGroupToDate,
    reorderSlot,
    duplicateSection,
    renameSectionOnDay,
    removeSectionOnDay,
    duplicateSession,
    updateSession,
    commitCapacityDraft,
  };
}

export type SlotActions = ReturnType<typeof useSlotActions>;
