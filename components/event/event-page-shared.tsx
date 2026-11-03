"use client";

import { type CampaignItemWithSignups, type Session } from "@/lib/types";
import { compareBySortOrder } from "@/lib/session-sort-order";

export const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

/** Reorder items so same-section items are contiguous (preserving each section's
 *  first-appearance order and original order within), enabling a single header
 *  per section in the render. Ungrouped items (no section) keep their position. */
export function orderBySection(items: CampaignItemWithSignups[]): CampaignItemWithSignups[] {
  const order: string[] = [];
  const buckets = new Map<string, CampaignItemWithSignups[]>();
  for (const it of items) {
    const key = (it.section ?? "").trim();
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(it);
  }
  return order.flatMap((k) => buckets.get(k)!);
}

/** Public page fetches id + guest_names to compute real headcount against capacity. */
export interface SessionWithSignups extends Session {
  signups:
    | {
        id: string;
        member_name: string;
        signup_note: string | null;
        guest_names: string[];
      }[]
    | null;
}

/** Same section-grouping as orderBySection, for a date's sessions (class slots). */
export function orderSessionsBySection(sessions: SessionWithSignups[]): SessionWithSignups[] {
  // Pre-sort by the organizer's explicit sort_order so BOTH section order
  // (first appearance) and within-section order follow it. Falls back to
  // created_at/id for slots that predate sort_order.
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
