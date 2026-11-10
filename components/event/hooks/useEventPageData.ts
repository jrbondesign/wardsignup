"use client";

import { sessionLastDate } from "@/lib/calendar-times";
import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { loadPublicEventPage, type PublicEventClient } from "@/lib/public-event-page";
import { type SessionWithSignups } from "@/components/event/event-page-shared";
import { type EventPageInit, type EventPageState } from "./useEventPageState";
import { EVENT_PAGE_CACHE_SECONDS } from "@/lib/event-page-cache-config";

/** First calendar month with an upcoming dated slot, in the visitor's local date. */
export function firstUpcomingMonth(sessions: SessionWithSignups[], now: Date = new Date()): Date | null {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const futureDates = sessions
    .filter((s) => s.session_date)
    // Keep an overnight slot that is still running today (it started yesterday).
    .filter((s) => {
      const [y, m, d] = sessionLastDate(s.session_date!, s.time, s.end_time).split("-").map(Number);
      return new Date(y, m - 1, d) >= today;
    })
    .map((s) => {
      const [y, m, d] = s.session_date!.split("-").map(Number);
      return new Date(y, m - 1, d);
    })
    .sort((a, b) => a.getTime() - b.getTime());
  return futureDates.length > 0 ? new Date(futureDates[0].getFullYear(), futureDates[0].getMonth(), 1) : null;
}

/**
 * Server data younger than this is shown as is: no background refresh. Every
 * signup, cancel and organizer edit expires the server cache on demand, so
 * data inside the server window (EVENT_PAGE_CACHE_SECONDS) is already
 * current. Older data means the server served a stale entry while it
 * refreshes (first view after a quiet spell), so the browser reloads it.
 * Matching the window keeps the browser from re-reading Postgres on views the
 * server cache already answered.
 */
export const BACKGROUND_REFRESH_AFTER_MS = EVENT_PAGE_CACHE_SECONDS * 1000;
/** Allowed browser clock skew; beyond it the age is unknown and we refresh as before. */
const CLOCK_SKEW_MS = 5 * 60_000;

/**
 * Whether server rendered data needs a background refresh in the browser.
 * Fresh server data (normal page load) skips it, saving one
 * get_public_event_page call per view; old data (back/forward to a cached
 * page, or no timestamp) still refreshes so counts stay current.
 */
export function needsBackgroundRefresh(loadedAt: number | undefined, now: number): boolean {
  if (typeof loadedAt !== "number" || !Number.isFinite(loadedAt)) return true;
  const age = now - loadedAt;
  if (age < -CLOCK_SKEW_MS) return true;
  return age > BACKGROUND_REFRESH_AFTER_MS;
}

/**
 * Loads the event, sessions, items and public signups. When the server already
 * loaded them (init.initialPage is set), the page renders right away; the
 * browser refreshes in the background only when that data is old (see
 * needsBackgroundRefresh). fetchData also runs after every signup to refresh
 * counts and names.
 */
export function useEventPageData(ctx: EventPageState, init: EventPageInit = {}) {
  const {
    eventId,
    setAllowGuests,
    setCalendarMonth,
    setCustomSignups,
    setError,
    setEvent,
    setEventType,
    setItems,
    setLoading,
    setSelectedSessions,
    setSessions,
    setShowCapacityPublicly,
    setShowSignupsPublicly,
  } = ctx;

  // Local date dependent state (calendar month) and the single slot auto
  // select. Browser only, so the server render never depends on "today".
  const applyBrowserOnlyState = useCallback((mergedSessions: SessionWithSignups[]) => {
    // Single-session bypass: auto-select the only session so the form is ready immediately
    if (mergedSessions.length === 1) {
      const only = mergedSessions[0];
      const headcount = (only.signups ?? []).length;
      if (headcount < only.capacity) {
        setSelectedSessions([only.id]);
      }
    }
    // Initialize calendar to the month of the earliest upcoming session
    const month = firstUpcomingMonth(mergedSessions);
    if (month) setCalendarMonth(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters come from useEventPageState and are stable
  }, []);

  const fetchData = useCallback(async (opts?: { background?: boolean }) => {
    try {
      // One RPC (get_public_event_page) when the database has it, else the old
      // public RPC + parallel table/view reads. Public safe fields only.
      const page = await loadPublicEventPage(supabase as unknown as PublicEventClient, eventId);
      if (!page) throw new Error("Event not found");
      const { event: eventData, eventType: resolvedType } = page;

      setEventType(resolvedType);
      setShowSignupsPublicly(Boolean(eventData.show_signups_publicly));
      // allow_guests defaults true (null/undefined = true for existing events)
      setAllowGuests(eventData.allow_guests == null ? true : Boolean(eventData.allow_guests));
      // show_capacity_publicly defaults true
      setShowCapacityPublicly(eventData.show_capacity_publicly == null ? true : Boolean(eventData.show_capacity_publicly));

      if (resolvedType === "items") {
        setItems(page.items);
        setCustomSignups(page.customSignups);
        setEvent(eventData);
        return;
      }

      const mergedSessions = page.sessions;
      setEvent(eventData);
      setSessions(mergedSessions);

      applyBrowserOnlyState(mergedSessions);
    } catch (err) {
      console.error("Error fetching data:", err);
      // A failed background refresh keeps the server rendered data on screen.
      if (!opts?.background) setError("Failed to load event");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters come from useEventPageState and are stable
  }, [eventId, applyBrowserOnlyState]);

  // Server data present: apply the browser only bits now. Refresh in the
  // background (no spinner) only when the server data is old, e.g. after
  // back/forward navigation to a cached page. No server data (slow or failed):
  // fetch now, with the spinner, exactly as before.
  const initialPage = init.initialPage;
  const initialLoadedAt = init.initialLoadedAt;
  const startedInitial = useRef(false);
  useEffect(() => {
    if (startedInitial.current) return;
    startedInitial.current = true;
    if (initialPage === undefined) {
      fetchData();
      return;
    }
    if (initialPage && initialPage.eventType !== "items") applyBrowserOnlyState(initialPage.sessions);
    if (!initialPage) return;
    if (!needsBackgroundRefresh(initialLoadedAt, Date.now())) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(() => fetchData({ background: true }));
    else setTimeout(() => fetchData({ background: true }), 1000);
  }, [fetchData, initialPage, initialLoadedAt, applyBrowserOnlyState]);

  return {
    fetchData,
  };
}

export type EventPageData = ReturnType<typeof useEventPageData>;
