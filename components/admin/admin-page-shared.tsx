"use client";

import { Session, Signup } from "@/lib/types";
import { compareBySortOrder } from "@/lib/session-sort-order";
import { formatTime } from "@/lib/utils";

export const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export interface SessionWithSignups extends Session {
  signups: Signup[];
}

/**
 * Group a day's sessions by `section`, ordered by the organizer's explicit
 * sort_order (both section order and within-section). Mirrors the public
 * signup page so the admin roster shows each distinct class slot (Women's
 * Class, Men's Class 1, …) in the same order.
 */
export function orderSessionsBySection(sessions: SessionWithSignups[]): SessionWithSignups[] {
  const sorted = [...sessions].sort(compareBySortOrder);
  const order: string[] = [];
  const buckets = new Map<string, SessionWithSignups[]>();
  for (const s of sorted) {
    const key = (s.section ?? "").trim();
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(s);
  }
  return order.flatMap((k) => buckets.get(k)!);
}

/** "2026-06-25" → "Jun 25" (or with year). Local-time safe (no UTC shift). */
export function formatSessionDate(iso: string, withYear = false): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

/** Format a slot label with article and proper time range: "the 5:00 to 7:00 PM slot" or "the 5:00 PM slot" */
export function formatSlotLabel(session: SessionWithSignups): string {
  const startTime = formatTime(session.time);
  if (session.end_time) {
    const endTime = formatTime(session.end_time);
    return `the ${startTime} to ${endTime} slot`;
  }
  return `the ${startTime} slot`;
}

/** Format last sync time as relative time (e.g. "2m ago", "1h ago") */
export function formatSyncTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
