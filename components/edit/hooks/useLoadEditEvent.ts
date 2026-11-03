"use client";

import { useEffect } from "react";
import { createClientComponentClient } from "@/lib/auth";
import { campaignMatchesHostBrand } from "@/lib/campaign-brand-guard";
import { mapDbSessionsToState } from "@/components/edit/edit-page-shared";
import { inferTithingDeclarationConfig } from "@/lib/tithing-reschedule";
import { type EditEventState } from "./useEditEventState";

/** Loads the campaign, calendar sync, items and sessions into editor state. */
export function useLoadEditEvent(ctx: EditEventState) {
  const {
    brand,
    error,
    eventId,
    setAllowGuests,
    setCalendarId,
    setCalendarLastError,
    setCalendarLastSyncedAt,
    setCalendarName,
    setCalendarSyncEnabled,
    setCoverPosition,
    setCoverUrl,
    setDigestEnabled,
    setError,
    setEventDescription,
    setEventName,
    setEventTimezone,
    setInstantEnabled,
    setInviteLeader,
    setIsItemsEvent,
    setIsTithingReschedule,
    setItemsApproximateTime,
    setItemsEventDates,
    setItemsEventEndTime,
    setItemsEventStartTime,
    setItemsList,
    setLeaderEmail,
    setLeaderName,
    setListOnDirectory,
    setLoadedSessionIds,
    setLoading,
    setLogoUrl,
    setOrganizationId,
    setRescheduleCapacity,
    setRescheduleDays,
    setRescheduleEnd,
    setRescheduleEndTime,
    setRescheduleLocation,
    setRescheduleNotes,
    setRescheduleStart,
    setRescheduleTime,
    setSavedSnapshot,
    setSessions,
    setShowCapacityPublicly,
    setShowSignupsPublicly,
    setSignupCount,
    setSignupsBySession,
    setTithingCapacity,
    setTithingDays,
    setTithingDuration,
  } = ctx;

  useEffect(() => {
    const loadEvent = async () => {
      try {
        const supabase = createClientComponentClient();

        const { data: event, error: fetchError } = await supabase
          .from("campaigns")
          .select("*")
          .eq("id", eventId)
          .single();

        if (fetchError || !event) {
          setError("Event not found");
          return;
        }

        if (!campaignMatchesHostBrand((event as { brand_id?: string }).brand_id, brand)) {
          setError("Event not found");
          setLoading(false);
          return;
        }

        // Store organization ID for feature gating
        setOrganizationId((event as any).organization_id ?? null);

        // Future: Load org logo if Ward Signup supports custom logos
        const profileLogoUrl = null;
        setLogoUrl(profileLogoUrl);

        setLeaderName((event as any).leader_name ?? "");
        setLeaderEmail((event as any).leader_email ?? "");
        setDigestEnabled(Boolean((event as any).organizer_digest_enabled));
        setInstantEnabled(Boolean((event as any).organizer_instant_notify_enabled));
        setShowSignupsPublicly(Boolean((event as any).show_signups_publicly));
        setListOnDirectory(typeof (event as any).list_on_directory === "boolean" ? (event as any).list_on_directory : true);
        const loadedTzRawEarly = (event as any).event_timezone;
        if (typeof loadedTzRawEarly === "string" && loadedTzRawEarly.trim()) {
          setEventTimezone(loadedTzRawEarly.trim());
        }
        const ag = (event as any).allow_guests;
        setAllowGuests(ag == null ? true : Boolean(ag));
        const scp = (event as any).show_capacity_publicly;
        setShowCapacityPublicly(scp == null ? true : Boolean(scp));
        
        // Load calendar sync settings
        const { data: calSyncData } = await supabase
          .from("campaign_calendar_sync")
          .select("*")
          .eq("campaign_id", eventId)
          .maybeSingle();
        
        if (calSyncData) {
          setCalendarSyncEnabled(Boolean((calSyncData as any).enabled));
          setCalendarId((calSyncData as any).calendar_id || "");
          setCalendarName((calSyncData as any).calendar_name || "");
          setInviteLeader(Boolean((calSyncData as any).invite_leader));
          setCalendarLastSyncedAt((calSyncData as any).last_synced_at);
          setCalendarLastError((calSyncData as any).last_error);
        }

        // Items events: load items and render the items editor
        if ((event as any).event_type === "items") {
          setEventName((event as any).name || "");
          setEventDescription((event as any).description || "");
          setCoverUrl((event as any).cover_image_url ?? null);
          setCoverPosition((event as any).cover_position ?? null);
          // Prefer the multi-date list; fall back to the legacy single event_date
          // so older items events still show their date in the editor (and migrate
          // to event_dates on the next save).
          const rawDates = (event as any).event_dates;
          const loadedDates = Array.isArray(rawDates)
            ? rawDates.filter((d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))
            : [];
          const ed = (event as any).event_date as string | null | undefined;
          if (loadedDates.length > 0) {
            setItemsEventDates(loadedDates);
          } else if (ed && /^\d{4}-\d{2}-\d{2}$/.test(ed)) {
            setItemsEventDates([ed]);
          }
          const rawStart = (event as any).event_start_time as string | null;
          const rawEnd = (event as any).event_end_time as string | null;
          const isStandardTime = (t: string | null) =>
            !!t && /^\d{2}:\d{2}(:\d{2})?$/.test(t.trim());
          if ((rawStart && !isStandardTime(rawStart)) || (rawEnd && !isStandardTime(rawEnd))) {
            setItemsApproximateTime(true);
            setItemsEventStartTime(rawStart ?? "");
            setItemsEventEndTime(rawEnd ?? "");
          } else {
            const trimTime = (t: string | null) =>
              t && typeof t === "string" ? t.slice(0, 5) : "";
            setItemsEventStartTime(trimTime(rawStart));
            setItemsEventEndTime(trimTime(rawEnd));
          }
          const { data: existingItems } = await supabase
            .from("campaign_items")
            .select("id, label, item_limit, section, item_signups(id)")
            .eq("campaign_id", eventId)
            .order("sort_order")
            .order("created_at");
          if (existingItems && existingItems.length > 0) {
            setItemsList(
              (existingItems as unknown as { id: string; label: string; item_limit: number | null; section: string | null; item_signups: { id: string }[] }[]).map((it) => ({
                id: it.id,
                label: it.label,
                itemLimit: it.item_limit,
                section: it.section ?? "",
                hasSignups: it.item_signups.length > 0,
              }))
            );
          }
          setIsItemsEvent(true);
          return;
        }

        const loadedName = (event as any).name;
        const loadedDesc = (event as any).description || "";
        const loadedTzRaw = (event as any).event_timezone;
        const loadedTz =
          typeof loadedTzRaw === "string" && loadedTzRaw.trim()
            ? loadedTzRaw.trim()
            : "America/Phoenix";
        setEventName(loadedName);
        setEventDescription(loadedDesc);
        setEventTimezone(loadedTz);
        setCoverUrl((event as any).cover_image_url ?? null);
          setCoverPosition((event as any).cover_position ?? null);

        // Load sessions
        const { data: sessionData, error: sessionError } = await supabase
          .from("sessions")
          .select("*")
          .eq("campaign_id", eventId)
          // Stable server order; the display grouping applies sort_order
          // client-side (works whether or not the column exists yet).
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });

        if (sessionError) {
          console.error("Error loading sessions:", sessionError);
        } else if (sessionData && sessionData.length > 0) {
          const mapped = mapDbSessionsToState(sessionData);
          setSessions(mapped);
          setLoadedSessionIds(mapped.map((s: any) => s.id).filter(Boolean));
          setSavedSnapshot(
            JSON.stringify({
              name: loadedName,
              description: loadedDesc,
              eventTimezone: loadedTz,
              sessions: mapped,
            }),
          );

          // Pre-fill replace-schedule defaults from existing sessions
          const first = mapped[0];
          if (first?.time) setRescheduleTime(first.time);
          setRescheduleEndTime(first?.end_time || "");
          setRescheduleCapacity(first?.capacity ?? 1);
          setRescheduleLocation(first?.location ?? "");
          setRescheduleNotes(first?.notes ?? "");
          const existingDays = Array.from(new Set(mapped.map((s: any) => s.day_of_week))).sort();
          if (existingDays.length > 0) setRescheduleDays(existingDays);

          // Count signups across all sessions
          const sessionIds = mapped.map((s: any) => s.id).filter(Boolean);
          if (sessionIds.length > 0) {
            const { count } = await supabase
              .from("signups")
              .select("id", { count: "exact", head: true })
              .in("session_id", sessionIds);
            setSignupCount(count ?? 0);
            const { data: suRows } = await supabase
              .from("signups")
              .select("session_id")
              .in("session_id", sessionIds);
            const bySession: Record<string, number> = {};
            for (const r of (suRows ?? []) as { session_id: string }[]) {
              bySession[r.session_id] = (bySession[r.session_id] ?? 0) + 1;
            }
            setSignupsBySession(bySession);
          }

          // Pre-fill reschedule range from existing session_dates
          const dates = mapped
            .filter((s: any) => s.session_date)
            .map((s: any) => {
              const [y, m, d] = s.session_date.split('-').map(Number);
              return new Date(y, m - 1, d);
            })
            .sort((a: Date, b: Date) => a.getTime() - b.getTime());
          if (dates.length >= 2) {
            setRescheduleStart(dates[0]);
            setRescheduleEnd(dates[dates.length - 1]);
          } else if (dates.length === 1) {
            setRescheduleStart(dates[0]);
          }

          const inferred = inferTithingDeclarationConfig(mapped);
          setIsTithingReschedule(inferred.isTithingDeclaration);
          setTithingDays(inferred.days);
          setTithingDuration(inferred.durationMinutes);
          setTithingCapacity(inferred.capacity);

          if (inferred.isTithingDeclaration) {
            setRescheduleTime(inferred.startTime);
            setRescheduleEndTime(inferred.endTime);
          }
        } else {
          setSavedSnapshot(
            JSON.stringify({
              name: loadedName,
              description: loadedDesc,
              eventTimezone: loadedTz,
              sessions: [],
            }),
          );
        }
      } catch (error: any) {
        setError(error.message || "Failed to load event");
      } finally {
        setLoading(false);
      }
    };

    loadEvent();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters come from useEditEventState and are stable
  }, [eventId, brand]);
}
