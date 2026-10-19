"use client";

import { useCallback, useEffect } from "react";
import { getPublicCampaignById, supabase } from "@/lib/supabase";
import { type CampaignItemWithSignups, type Session } from "@/lib/types";
import { SessionWithSignups } from "@/components/event/event-page-shared";
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
      // RLS on campaigns is org-scoped post-PR-7, so anon visitors can no longer
      // do a direct table read. Visibility flags now ride along on the public RPC,
      // which is SECURITY DEFINER and bypasses RLS for the public-safe columns.
      const pubResult = await getPublicCampaignById(eventId);

      const { data: pubRows, error: eventError } = pubResult;
      const rows = Array.isArray(pubRows) ? pubRows : pubRows ? [pubRows] : [];
      const eventData = rows[0] as
        | {
            id: string;
            name: string;
            description: string | null;
            event_type?: string | null;
            show_signups_publicly?: boolean | null;
            allow_guests?: boolean | null;
            show_capacity_publicly?: boolean | null;
          }
        | undefined;
      if (eventError || !eventData) throw eventError ?? new Error("Event not found");

      const resolvedType: "spots" | "items" | "rsvp" =
        eventData.event_type === "items" ? "items"
        : eventData.event_type === "rsvp" ? "rsvp"
        : "spots";
      setEventType(resolvedType);
      setShowSignupsPublicly(Boolean(eventData.show_signups_publicly));
      // allow_guests defaults true (null/undefined = true for existing events)
      setAllowGuests(eventData.allow_guests == null ? true : Boolean(eventData.allow_guests));
      // show_capacity_publicly defaults true
      setShowCapacityPublicly(eventData.show_capacity_publicly == null ? true : Boolean(eventData.show_capacity_publicly));

      // Public-safe signup rows come from views (no email/phone). PostgREST cannot
      // nest-embed views (no FKs), so we load parents + views separately and merge.
      if (resolvedType === "items") {
        const [{ data: itemsData, error: itemsError }, { data: itemSignupRows, error: itemSignupsError }] =
          await Promise.all([
            supabase
              .from("campaign_items")
              .select("*")
              .eq("campaign_id", eventId)
              .order("sort_order")
              .order("created_at"),
            supabase
              .from("item_signups_public")
              .select("id, item_id, member_name, custom_label, signup_note, quantity")
              .eq("campaign_id", eventId)
              .order("signed_up_at"),
          ]);
        if (itemsError) throw itemsError;
        if (itemSignupsError) throw itemSignupsError;

        const byItemId = new Map<string, NonNullable<CampaignItemWithSignups["item_signups"]>>();
        const customRows: {
          id: string;
          member_name: string;
          custom_label: string | null;
          signup_note: string | null;
          quantity: number;
        }[] = [];
        for (const row of itemSignupRows ?? []) {
          const r = row as {
            id: string;
            item_id: string | null;
            member_name: string;
            custom_label: string | null;
            signup_note: string | null;
            quantity: number;
          };
          if (r.item_id == null) {
            customRows.push({
              id: r.id,
              member_name: r.member_name,
              custom_label: r.custom_label,
              signup_note: r.signup_note,
              quantity: r.quantity,
            });
            continue;
          }
          const list = byItemId.get(r.item_id) ?? [];
          list.push({
            id: r.id,
            member_name: r.member_name,
            signup_note: r.signup_note,
            quantity: r.quantity,
          } as never);
          byItemId.set(r.item_id, list);
        }

        setItems(
          ((itemsData || []) as CampaignItemWithSignups[]).map((item) => ({
            ...item,
            item_signups: byItemId.get(item.id) ?? [],
          }))
        );
        setCustomSignups(customRows);

        setEvent(eventData);
        return;
      }

      // Select * (not an explicit list) so sort_order is included when present
      // but its absence on an un-migrated brand doesn't error the query.
      const [{ data: sessionsData, error: sessionsError }, { data: signupRows, error: signupsError }] =
        await Promise.all([
          supabase
            .from("sessions")
            .select("*")
            .eq("campaign_id", eventId)
            .order("session_date", { nullsFirst: false })
            // sort_order is applied client-side (orderSessionsBySection) so this
            // works whether or not the column exists yet.
            .order("created_at", { ascending: true })
            .order("id", { ascending: true }),
          supabase
            .from("signups_public")
            .select("id, session_id, member_name, signup_note, guest_names")
            .eq("campaign_id", eventId),
        ]);
      if (sessionsError) throw sessionsError;
      if (signupsError) throw signupsError;

      const bySessionId = new Map<
        string,
        NonNullable<SessionWithSignups["signups"]>
      >();
      for (const row of signupRows ?? []) {
        const r = row as {
          id: string;
          session_id: string;
          member_name: string;
          signup_note: string | null;
          guest_names: string[] | null;
        };
        const list = bySessionId.get(r.session_id) ?? [];
        list.push({
          id: r.id,
          member_name: r.member_name,
          signup_note: r.signup_note,
          guest_names: r.guest_names ?? [],
        });
        bySessionId.set(r.session_id, list);
      }

      const mergedSessions = ((sessionsData || []) as Session[]).map((session) => ({
        ...session,
        signups: bySessionId.get(session.id) ?? [],
      })) as SessionWithSignups[];

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
