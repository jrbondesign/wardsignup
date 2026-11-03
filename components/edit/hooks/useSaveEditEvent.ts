"use client";

import { SessionData, mapDbSessionsToState, scrollToEditSection } from "@/components/edit/edit-page-shared";
import { createClientComponentClient } from "@/lib/auth";
import { groupSessionsForDisplay } from "@/lib/edit-session-classes";
import { isMissingSortOrderError, stripSortOrder } from "@/lib/session-sort-order";
import { type EditEventState } from "./useEditEventState";
import { type EditEventSettings } from "./useEditEventSettings";
import { type ScheduleBuilders } from "./useScheduleBuilders";
import { type SlotActions } from "./useSlotActions";

/** Saves the schedule (with destructive-delete guard) and items events. */
export function useSaveEditEvent(ctx: EditEventState & EditEventSettings & ScheduleBuilders & SlotActions) {
  const {
    allowDestructiveDeletesOnceRef,
    error,
    eventDescription,
    eventId,
    eventName,
    eventTimezone,
    itemsApproximateTime,
    itemsEventDates,
    itemsEventEndTime,
    itemsEventStartTime,
    itemsList,
    loadedSessionIds,
    pendingDeleteSessionIdsRef,
    router,
    sessions,
    setCapacityInputDraft,
    setDeleteSessionsSignupCount,
    setError,
    setItemsError,
    setItemsSaving,
    setLastSavedAt,
    setLoadedSessionIds,
    setSavedSnapshot,
    setSaving,
    setSessions,
    setShowDeleteSessionsConfirm,
    setShowToast,
    setSignupCount,
    setSignupsBySession,
    setToastMessage,
  } = ctx;

  const performSave = async (opts?: { allowDeleteWithSignups?: boolean }) => {
    if (!eventName.trim()) {
      setError("Event name is required");
      scrollToEditSection("edit-event-name");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();

      // Assign sort_order from the current display order so drag-reordering (and
      // freshly added slots) persist a stable, explicit order.
      const displayOrdered = groupSessionsForDisplay(sessions).flatMap((g) =>
        g.items.map((i) => i.session),
      );
      const sortOrderByRef = new Map<SessionData, number>();
      displayOrdered.forEach((s, i) => sortOrderByRef.set(s as SessionData, i));

      const normalizedSessions: SessionData[] = sessions.map((s) => ({
        ...s,
        time: (s.time || "").trim(),
        end_time: (s.end_time || "").trim() || undefined,
        location: (s.location || "").trim(),
        notes: (s.notes || "").trim(),
        capacity: Number.isFinite(s.capacity) ? Math.max(1, s.capacity) : 1,
        sort_order: sortOrderByRef.get(s) ?? 0,
      }));

      const currentIds = normalizedSessions.map((s) => s.id).filter(Boolean) as string[];
      const toDeleteIds = loadedSessionIds.filter((id) => !currentIds.includes(id));

      if (
        toDeleteIds.length > 0 &&
        !opts?.allowDeleteWithSignups &&
        !allowDestructiveDeletesOnceRef.current
      ) {
        const { count } = await supabase
          .from("signups")
          .select("id", { count: "exact", head: true })
          .in("session_id", toDeleteIds);

        if ((count ?? 0) > 0) {
          pendingDeleteSessionIdsRef.current = toDeleteIds;
          setDeleteSessionsSignupCount(count ?? 0);
          setShowDeleteSessionsConfirm(true);
          setSaving(false);
          return;
        }
      }

      // If we got here due to reschedule confirmation, consume it.
      allowDestructiveDeletesOnceRef.current = false;

      // Update event name and description
      const response = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          name: eventName,
          description: eventDescription,
          event_timezone: eventTimezone,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update event");
      }

      const toUpsert = normalizedSessions
        .filter((s) => !!s.id)
        .map((s) => ({
          id: s.id,
          campaign_id: eventId,
          day_of_week: s.day_of_week,
          time: s.time,
          end_time: s.end_time || null,
          capacity: s.capacity,
          location: s.location,
          notes: s.notes,
          session_date: s.session_date || null,
          label: s.label?.trim() || null,
          section: s.section?.trim() || null,
          sort_order: s.sort_order ?? 0,
        }));

      if (toUpsert.length > 0) {
        let { error: upsertError } = await supabase
          .from("sessions")
          .upsert(toUpsert as any, { onConflict: "id" });
        if (upsertError && isMissingSortOrderError(upsertError)) {
          ({ error: upsertError } = await supabase
            .from("sessions")
            .upsert(stripSortOrder(toUpsert as unknown as Record<string, unknown>[]) as any, { onConflict: "id" }));
        }
        if (upsertError) throw new Error("Failed to update sessions");
      }

      const toInsert = normalizedSessions
        .filter((s) => !s.id)
        .map((s) => ({
          campaign_id: eventId,
          day_of_week: s.day_of_week,
          time: s.time,
          end_time: s.end_time || null,
          capacity: s.capacity,
          location: s.location,
          notes: s.notes,
          session_date: s.session_date || null,
          label: s.label?.trim() || null,
          section: s.section?.trim() || null,
          sort_order: s.sort_order ?? 0,
        }));

      if (toInsert.length > 0) {
        let { error: insertError } = await supabase.from("sessions").insert(toInsert as any);
        if (insertError && isMissingSortOrderError(insertError)) {
          ({ error: insertError } = await supabase
            .from("sessions")
            .insert(stripSortOrder(toInsert as unknown as Record<string, unknown>[]) as any));
        }
        if (insertError) throw new Error("Failed to create new sessions");
      }

      if (toDeleteIds.length > 0) {
        const { error: deleteError } = await supabase.from("sessions").delete().in("id", toDeleteIds);
        if (deleteError) throw new Error("Failed to delete removed sessions");
      }

      const { data: reloadedSessions, error: reloadErr } = await supabase
        .from("sessions")
        .select("*")
        .eq("campaign_id", eventId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (reloadErr) throw new Error("Failed to reload sessions");

      const mapped = mapDbSessionsToState(reloadedSessions || []);
      setSessions(mapped);
      setLoadedSessionIds(mapped.map((s) => s.id).filter(Boolean) as string[]);
      setSavedSnapshot(
        JSON.stringify({ name: eventName, description: eventDescription, eventTimezone, sessions: mapped }),
      );
      setCapacityInputDraft({});

      const sessionIds = mapped.map((s) => s.id).filter(Boolean) as string[];
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
      } else {
        setSignupCount(0);
        setSignupsBySession({});
      }

      setLastSavedAt(new Date());
      setToastMessage("Changes saved");
      setShowToast(true);
      setSaving(false);
    } catch (error: any) {
      setError(error.message || "Failed to update event");
      setSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await performSave();
  };

  // ── Items-event save ──────────────────────────────────────────────────────
  const handleSaveItems = async () => {
    const filledItems = itemsList.filter((it) => it.label.trim());
    if (!eventName.trim()) { setItemsError("Event name is required."); return; }
    if (filledItems.length === 0) { setItemsError("Add at least one item before saving."); return; }
    for (const it of filledItems) {
      if (it.itemLimit !== null && (!Number.isInteger(it.itemLimit) || it.itemLimit < 1)) {
        setItemsError("Limits must be positive whole numbers (or pick Unlimited).");
        return;
      }
    }
    if (!itemsApproximateTime && itemsEventStartTime && itemsEventEndTime && itemsEventStartTime >= itemsEventEndTime) {
      setItemsError("End time must be after start time.");
      return;
    }
    setItemsSaving(true);
    setItemsError("");
    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` };
      const detailsRes = await fetch(`/api/events/${eventId}`, {
        method: "PATCH", headers: authHeader,
        body: JSON.stringify({
          name: eventName.trim(),
          description: eventDescription.trim() || null,
          // First date doubles as event_date so single-date consumers keep working.
          event_date: itemsEventDates[0] ?? null,
          event_dates: itemsEventDates,
          event_start_time: itemsEventStartTime || null,
          event_end_time: itemsEventEndTime || null,
        }),
      });
      if (!detailsRes.ok) { const e = await detailsRes.json().catch(() => ({})); throw new Error(e?.error || "Failed to save event details"); }
      const itemsRes = await fetch("/api/items", {
        method: "PUT", headers: authHeader,
        body: JSON.stringify({
          campaign_id: eventId,
          items: filledItems.map((it) => ({ id: it.id, label: it.label.trim(), item_limit: it.itemLimit, section: (it.section ?? "").trim() || null })),
        }),
      });
      if (!itemsRes.ok) { const e = await itemsRes.json().catch(() => ({})); throw new Error(e?.error || "Failed to save items"); }
      router.replace(`/admin/${eventId}`);
    } catch (err: any) {
      setItemsError(err.message || "Failed to save. Please try again.");
    } finally {
      setItemsSaving(false);
    }
  };

  return {
    performSave,
    handleSave,
    handleSaveItems,
  };
}

export type SaveEditEvent = ReturnType<typeof useSaveEditEvent>;
