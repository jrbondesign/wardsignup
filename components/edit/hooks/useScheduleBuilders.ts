"use client";

import { SessionData, resolveSpotsDraft, scrollToEditSection } from "@/components/edit/edit-page-shared";
import { generateTithingDeclarationSessions } from "@/lib/tithing-reschedule";
import { type EditEventState } from "./useEditEventState";
import { type EditEventSettings } from "./useEditEventSettings";

/** Replace-schedule, add-multiple and add-one session builders. */
export function useScheduleBuilders(ctx: EditEventState & EditEventSettings) {
  const {
    allowDestructiveDeletesOnceRef,
    bulkCapacity,
    bulkCapacityDraft,
    bulkDays,
    bulkEndDate,
    bulkEndTime,
    bulkLocation,
    bulkNotes,
    bulkStartDate,
    bulkTime,
    isTithingReschedule,
    newSessionCapacity,
    newSessionDate,
    newSessionDayOfWeek,
    newSessionEndTime,
    newSessionLabel,
    newSessionLocation,
    newSessionNotes,
    newSessionSection,
    newSessionTime,
    newSessionUseDate,
    rescheduleCapacity,
    rescheduleCapacityDraft,
    rescheduleDays,
    rescheduleEnd,
    rescheduleEndTime,
    rescheduleLocation,
    rescheduleNotes,
    rescheduleStart,
    rescheduleTime,
    sessions,
    setBulkCapacity,
    setBulkCapacityDraft,
    setBulkDays,
    setBulkEndDate,
    setBulkEndTime,
    setBulkLocation,
    setBulkNotes,
    setBulkRangeEnd,
    setBulkRangeStart,
    setBulkStartDate,
    setBulkTime,
    setError,
    setNewSessionCapacity,
    setNewSessionDate,
    setNewSessionDateObj,
    setNewSessionDayOfWeek,
    setNewSessionEndTime,
    setNewSessionLabel,
    setNewSessionLocation,
    setNewSessionNotes,
    setNewSessionSection,
    setNewSessionTime,
    setRescheduleCapacity,
    setRescheduleCapacityDraft,
    setSessions,
    setShowAddSession,
    setShowBulk,
    setShowReschedule,
    setShowRescheduleConfirm,
    setShowToast,
    setSignupCount,
    setTithingCapacity,
    setTithingCapacityDraft,
    setToastMessage,
    signupCount,
    tithingCapacity,
    tithingCapacityDraft,
    tithingDays,
    tithingDuration,
  } = ctx;

  const toggleBulkDay = (day: number) => {
    if (bulkDays.includes(day)) {
      setBulkDays(bulkDays.filter(d => d !== day));
    } else {
      setBulkDays([...bulkDays, day].sort());
    }
  };

  const applyReschedule = () => {
    if (!rescheduleStart || !rescheduleEnd) return;
    if (signupCount > 0) {
      setShowRescheduleConfirm(true);
      return;
    }
    commitReschedule();
  };

  const commitReschedule = () => {
    if (!rescheduleStart || !rescheduleEnd) return;
    if (signupCount > 0) {
      // Reschedule confirm already warned; don't double-confirm on save.
      allowDestructiveDeletesOnceRef.current = true;
    }
    const location = (rescheduleLocation ?? "").trim();
    const notes = (rescheduleNotes ?? "").trim();

    const tCap = resolveSpotsDraft(tithingCapacityDraft, tithingCapacity);
    const rCap = resolveSpotsDraft(rescheduleCapacityDraft, rescheduleCapacity);

    const newSessions: SessionData[] = isTithingReschedule
      ? generateTithingDeclarationSessions({
          rangeStart: rescheduleStart,
          rangeEnd: rescheduleEnd,
          days: tithingDays,
          startTime: rescheduleTime,
          endTime: rescheduleEndTime,
          durationMinutes: tithingDuration,
          capacity: tCap,
          location,
          notes,
        })
      : (() => {
          const s: SessionData[] = [];
          const cur = new Date(rescheduleStart);
          cur.setHours(0, 0, 0, 0);
          const end = new Date(rescheduleEnd);
          end.setHours(0, 0, 0, 0);
          while (cur <= end) {
            if (!rescheduleDays.includes(cur.getDay())) {
              cur.setDate(cur.getDate() + 1);
              continue;
            }
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, "0");
            const d = String(cur.getDate()).padStart(2, "0");
            s.push({
              day_of_week: cur.getDay(),
              time: rescheduleTime,
              end_time: rescheduleEndTime || undefined,
              capacity: rCap,
              location,
              notes,
              session_date: `${y}-${m}-${d}`,
            });
            cur.setDate(cur.getDate() + 1);
          }
          return s;
        })();

    setTithingCapacity(tCap);
    setRescheduleCapacity(rCap);
    setTithingCapacityDraft(undefined);
    setRescheduleCapacityDraft(undefined);

    setSessions(newSessions);
    setShowReschedule(false);
    setShowRescheduleConfirm(false);
    setSignupCount(0);
    setToastMessage(`Rescheduled to ${newSessions.length} slot${newSessions.length !== 1 ? 's' : ''}`);
    setShowToast(true);
  };

  const calculateSessionCount = () => {
    if (bulkDays.length === 0) return 0;

    // If date range is provided, count matching days
    if (bulkStartDate && bulkEndDate) {
      const [startYear, startMonth, startDay] = bulkStartDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = bulkEndDate.split('-').map(Number);
      const startDate = new Date(startYear, startMonth - 1, startDay);
      const endDate = new Date(endYear, endMonth - 1, endDay);

      if (startDate > endDate) return 0;

      let count = 0;
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        if (bulkDays.includes(currentDate.getDay())) {
          count++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
      return count;
    }

    // No date range - just return number of selected days
    return bulkDays.length;
  };

  const addBulkSessions = () => {
    if (bulkDays.length === 0) {
      setShowBulk(true);
      setError("Please select at least one day of the week.");
      scrollToEditSection("edit-bulk-days");
      return;
    }

    const bCap = resolveSpotsDraft(bulkCapacityDraft, bulkCapacity);

    let newSessions: SessionData[] = [];

    // If date range is provided, generate sessions for all matching dates
    if (bulkStartDate && bulkEndDate) {
      // Parse dates in local timezone to avoid timezone issues
      const [startYear, startMonth, startDay] = bulkStartDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = bulkEndDate.split('-').map(Number);
      const startDate = new Date(startYear, startMonth - 1, startDay);
      const endDate = new Date(endYear, endMonth - 1, endDay);

      if (startDate > endDate) {
        setShowBulk(true);
        setError("End date can’t be before the start date.");
        scrollToEditSection("edit-bulk-calendar");
        return;
      }

      // Generate sessions for each date in range that matches selected weekdays
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dayOfWeek = currentDate.getDay();
        if (bulkDays.includes(dayOfWeek)) {
          // Format date as YYYY-MM-DD in local timezone
          const year = currentDate.getFullYear();
          const month = String(currentDate.getMonth() + 1).padStart(2, '0');
          const day = String(currentDate.getDate()).padStart(2, '0');
          const dateString = `${year}-${month}-${day}`;

          newSessions.push({
            day_of_week: dayOfWeek,
            time: bulkTime,
            end_time: bulkEndTime || undefined,
            capacity: bCap,
            location: bulkLocation,
            notes: bulkNotes,
            session_date: dateString,
          });
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      if (newSessions.length === 0) {
        setShowBulk(true);
        setError(
          "No slots would be created. Pick weekdays that actually occur between your start and end dates.",
        );
        scrollToEditSection("edit-bulk-calendar");
        return;
      }
    } else {
      // No date range - create recurring sessions
      newSessions = bulkDays.map(day => ({
        day_of_week: day,
        time: bulkTime,
        end_time: bulkEndTime || undefined,
        capacity: bCap,
        location: bulkLocation,
        notes: bulkNotes,
      }));
    }

    setSessions([...sessions, ...newSessions]);

    // Show toast
    setToastMessage(`Added ${newSessions.length} slot${newSessions.length > 1 ? 's' : ''}!`);
    setShowToast(true);

    // Reset bulk form
    setBulkDays([]);
    setBulkTime("19:00");
    setBulkEndTime("");
    setBulkCapacity(bCap);
    setBulkCapacityDraft(undefined);
    setBulkLocation("");
    setBulkNotes("");
    setBulkStartDate("");
    setBulkEndDate("");
    setBulkRangeStart(null);
    setBulkRangeEnd(null);
    setError(null);
  };

  const addSession = () => {
    if (newSessionUseDate && !newSessionDate) {
      setShowAddSession(true);
      setError("Please select a date for this slot.");
      scrollToEditSection("edit-individual-date");
      return;
    }
    setError(null);

    let dow = newSessionDayOfWeek;
    let dateStr: string | undefined = undefined;
    if (newSessionUseDate && newSessionDate) {
      const [y, m, d] = newSessionDate.split('-').map(Number);
      dow = new Date(y, m - 1, d).getDay();
      dateStr = newSessionDate;
    }
    setSessions([...sessions, {
      day_of_week: dow,
      time: newSessionTime,
      end_time: newSessionEndTime || undefined,
      capacity: newSessionCapacity,
      location: newSessionLocation,
      notes: newSessionNotes,
      session_date: dateStr,
      label: newSessionLabel.trim() || undefined,
      section: newSessionSection.trim() || undefined,
    }]);
    setShowAddSession(false);
    setNewSessionDate("");
    setNewSessionDateObj(null);
    setNewSessionDayOfWeek(0);
    setNewSessionTime("19:00");
    setNewSessionEndTime("");
    setNewSessionCapacity(1);
    setNewSessionLocation("");
    setNewSessionNotes("");
    setNewSessionSection("");
    setNewSessionLabel("");
  };

  return {
    toggleBulkDay,
    applyReschedule,
    commitReschedule,
    calculateSessionCount,
    addBulkSessions,
    addSession,
  };
}

export type ScheduleBuilders = ReturnType<typeof useScheduleBuilders>;
