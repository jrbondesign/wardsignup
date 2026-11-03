import { revalidateTag } from "next/cache";

/**
 * Shared server cache for the public event page (/event/[id]).
 *
 * The anonymous event page read (get_public_event_page) is the same for every
 * visitor, so the server keeps it for EVENT_PAGE_CACHE_SECONDS instead of
 * hitting Postgres on every view. Every server route that changes what the page
 * shows (signup, cancel, item signup, slots, items, event details) calls
 * revalidateEventPage so the next view reads fresh counts right away.
 */
export const EVENT_PAGE_CACHE_SECONDS = 30;

export function eventPageTag(eventId: string): string {
  return `event-page:${eventId}`;
}

/** Expire the cached public event page now. Never throws: a failed revalidate only means up to EVENT_PAGE_CACHE_SECONDS of stale counts. */
export function revalidateEventPage(eventId: string | null | undefined): void {
  if (!eventId) return;
  try {
    revalidateTag(eventPageTag(eventId), { expire: 0 });
  } catch (err) {
    console.error("revalidateEventPage failed:", err);
  }
}
