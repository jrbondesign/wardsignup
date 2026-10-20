"use client";

import { useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { loadPublicEventPage, type PublicEventClient } from "@/lib/public-event-page";
import { type EventPageState } from "./useEventPageState";

/** Loads the event, sessions, items and public signups. */
export function useEventPageData(ctx: EventPageState) {
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

  const fetchData = useCallback(async () => {
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

      // Single-session bypass: auto-select the only session so the form is ready immediately
      if (mergedSessions.length === 1) {
        const only = mergedSessions[0];
        const headcount = (only.signups ?? []).length;
        if (headcount < only.capacity) {
          setSelectedSessions([only.id]);
        }
      }

      // Initialize calendar to the month of the earliest upcoming session
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const futureDates = mergedSessions
        .filter((s) => s.session_date)
        .map((s) => {
          const [y, m, d] = s.session_date!.split("-").map(Number);
          return new Date(y, m - 1, d);
        })
        .filter((d) => d >= today)
        .sort((a, b) => a.getTime() - b.getTime());
      if (futureDates.length > 0) {
        setCalendarMonth(new Date(futureDates[0].getFullYear(), futureDates[0].getMonth(), 1));
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Failed to load event");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters come from useEventPageState and are stable
  }, [eventId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return {
    fetchData,
  };
}

export type EventPageData = ReturnType<typeof useEventPageData>;
