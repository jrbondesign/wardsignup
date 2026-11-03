"use client";

import dynamic from "next/dynamic";
import { type ItemDraft } from "@/lib/create-form-state";
import { type FocusEvent as ReactFocusEvent, type MouseEvent as ReactMouseEvent } from "react";

export const DateRangePicker = dynamic(() => import("@/components/DateRangePicker"), {
  loading: () => (
    <span className="text-sm text-[#5A8399]">Loading date picker…</span>
  ),
  ssr: false,
});

export interface SessionData {
  id?: string;
  day_of_week: number;
  time: string;
  end_time?: string;
  capacity: number;
  location: string;
  notes: string;
  session_date?: string;
  /** Optional class-slot label (e.g. "Class 1") — present on per-date class events. */
  label?: string;
  /** Optional class-slot section header (e.g. "Men's Side"). */
  section?: string;
  /** Fallback ordering key for pre-migration data / freshly added slots. */
  created_at?: string;
  /** Explicit organizer-set display order (drag-reorder). */
  sort_order?: number;
}

export type ItemInput = ItemDraft;

export const emptyItemInput = (): ItemInput => ({ label: "", itemLimit: null });

export function mapDbSessionsToState(rows: any[] | null): SessionData[] {
  if (!rows?.length) return [];
  return rows.map((s: any) => ({
    id: s.id,
    day_of_week: s.day_of_week,
    time: s.time,
    end_time: s.end_time || undefined,
    capacity: s.capacity,
    location: s.location || "",
    notes: s.notes || "",
    session_date: s.session_date || undefined,
    label: s.label || undefined,
    section: s.section || undefined,
    created_at: s.created_at || undefined,
    sort_order: typeof s.sort_order === "number" ? s.sort_order : undefined,
  }));
}

/** "Thursday, Oct 8" for a dated day, or the weekday name for a recurring one. */
export function dayShortLabel(group: { sessionDate: string | null; dayOfWeek: number }): string {
  if (!group.sessionDate) return DAYS[group.dayOfWeek];
  const [year, month, day] = group.sessionDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const DURATION_PRESETS = [15, 30, 45, 60];

export function countTithingSlotsPerDay(startTime: string, endTime: string, duration: number): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) return 0;
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (duration <= 0) return 0;
  return Math.max(0, Math.floor((endMin - startMin) / duration));
}

export function countDaysInRange(rangeStart: Date, rangeEnd: Date, allowedDays: number[]): number {
  const daySet = new Set(allowedDays);
  const cur = new Date(rangeStart);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(rangeEnd);
  end.setHours(0, 0, 0, 0);
  let count = 0;
  while (cur <= end) {
    if (daySet.has(cur.getDay())) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** While typing spots, draft may be "" until blur/apply; minimum stored value is 1. */
export function resolveSpotsDraft(draft: string | undefined, committed: number): number {
  if (draft === undefined) return committed;
  const n = parseInt(draft, 10);
  return draft === "" || !Number.isFinite(n) || n < 1 ? 1 : n;
}

/** Select full value on focus; number inputs otherwise clear selection after mouseup. */
export function selectAllSpotsOnFocus(e: ReactFocusEvent<HTMLInputElement>) {
  e.currentTarget.select();
}

export function keepSpotsSelectionOnMouseUp(e: ReactMouseEvent<HTMLInputElement>) {
  e.preventDefault();
}

export function scrollToEditSection(elementId: string) {
  requestAnimationFrame(() => {
    setTimeout(() => {
      document.getElementById(elementId)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
  });
}
