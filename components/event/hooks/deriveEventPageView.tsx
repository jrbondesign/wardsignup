"use client";

import { SessionWithSignups } from "@/components/event/event-page-shared";
import { posthogDistinctIdHeader } from "@/lib/posthog-client";
import { type EventPageCtx } from "@/components/event/hooks/useEventPage";
import { buildFunnelProps } from "@/lib/signup-funnel";
import {
  EMAIL_NUDGE_EVENTS,
  hasSkippedEmailNudge,
  rememberEmailNudgeSkip,
  shouldShowEmailNudge,
} from "@/lib/email-nudge";

export type LoadedEventPageCtx = Omit<EventPageCtx, "event"> & { event: NonNullable<EventPageCtx["event"]> };

/** Signup handlers and values computed from a loaded event: grouped sessions, single-session mode and guest fields. */
export function deriveEventPageView(ctx: LoadedEventPageCtx) {
  const {
    captureNudge,
    customItem,
    emailInputRef,
    eventId,
    eventType,
    fetchData,
    formData,
    funnelCtx,
    guestNames,
    itemFormData,
    nudgeShownRef,
    nudgeVariant,
    posthog,
    router,
    selectedCalendarDate,
    selectedSessions,
    sessions,
    setCustomError,
    setCustomItem,
    setCustomSubmitting,
    setError,
    setExpandedItem,
    setGuestNames,
    setItemError,
    setItemFormData,
    setItemSubmitting,
    setItemSuccess,
    setNudgeOpen,
    setSelectedCalendarDate,
    setSelectedSessions,
    setSubmitting,
    showSignupsPublicly,
    submitting,
    trackFormStarted,
  } = ctx;

  const toggleSessionSelection = (sessionId: string) => {
    trackFormStarted("slots", "slot_selected");
    setSelectedSessions((prev) =>
      prev.includes(sessionId) ? prev.filter((id) => id !== sessionId) : [...prev, sessionId]
    );
  };

  const selectAllDaySessions = (daySessions: SessionWithSignups[]) => {
    const availableIds = daySessions.filter((s) => sessionHeadcount(s) < s.capacity).map((s) => s.id);
    const allSelected = availableIds.every((id) => selectedSessions.includes(id));
    setSelectedSessions((prev) => {
      const others = prev.filter((id) => !daySessions.find((s) => s.id === id));
      return allSelected ? others : [...others, ...availableIds];
    });
  };

  const handleItemSignup = async (e: React.FormEvent, itemId: string) => {
    e.preventDefault();
    if (!itemFormData.name.trim()) { setItemError("Please enter your name"); return; }
    setItemSubmitting(true);
    setItemError("");
    try {
      const { getAttributionForSubmission } = await import("@/lib/attribution");
      const res = await fetch("/api/item-signups", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...posthogDistinctIdHeader() },
        body: JSON.stringify({
          item_id: itemId,
          campaign_id: eventId,
          member_name: itemFormData.name,
          member_email: itemFormData.email,
          signup_note: itemFormData.note,
          quantity: itemFormData.quantity,
          ...(getAttributionForSubmission() || {}),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to sign up");
      }
      posthog?.capture("item_signup_completed", buildFunnelProps(funnelCtx, { item_id: itemId, has_email: Boolean(itemFormData.email.trim()), quantity: itemFormData.quantity }));
      setItemSuccess(true);
      setItemFormData({ name: "", email: "", note: "", quantity: 1 });
      setExpandedItem(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
      fetchData();
    } catch (err: any) {
      setItemError(err.message || "Failed to sign up. Please try again.");
    } finally {
      setItemSubmitting(false);
    }
  };

  const handleCustomItemSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customItem.label.trim()) { setCustomError("Tell us what you'll bring"); return; }
    if (!customItem.name.trim()) { setCustomError("Please enter your name"); return; }
    setCustomSubmitting(true);
    setCustomError("");
    try {
      const { getAttributionForSubmission } = await import("@/lib/attribution");
      const res = await fetch("/api/item-signups", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...posthogDistinctIdHeader() },
        body: JSON.stringify({
          campaign_id: eventId,
          custom_label: customItem.label.trim(),
          member_name: customItem.name.trim(),
          signup_note: customItem.note.trim() || null,
          quantity: 1,
          ...(getAttributionForSubmission() || {}),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to add your contribution");
      }
      posthog?.capture("item_signup_completed", buildFunnelProps(funnelCtx, { custom: true }));
      setCustomItem({ label: "", name: "", note: "" });
      fetchData();
    } catch (err: any) {
      setCustomError(err.message || "Failed to add your contribution");
    } finally {
      setCustomSubmitting(false);
    }
  };

  const handleSignup = async (e?: React.FormEvent, opts: { skipNudge?: boolean } = {}) => {
    e?.preventDefault();
    // For single-session events (rsvp/spots with one session), auto-use that session
    const sessionsToSignUp = isSingleSession && sessions.length === 1
      ? [sessions[0].id]
      : selectedSessions;
    if (sessionsToSignUp.length === 0) { setError("Please select at least one slot"); return; }
    if (!formData.name.trim()) { setError("Please enter your name"); return; }

    // Test arm only: one nudge per signup when a dated slot has no email.
    // Never blocks: Skip submits right away.
    if (
      !opts.skipNudge &&
      shouldShowEmailNudge({
        variant: nudgeVariant(),
        sheetType: eventType,
        email: formData.email,
        sessions,
        selectedIds: sessionsToSignUp,
        shownThisSignup: nudgeShownRef.current,
        skippedBefore: hasSkippedEmailNudge(),
      })
    ) {
      nudgeShownRef.current += 1;
      setNudgeOpen(true);
      captureNudge(EMAIL_NUDGE_EVENTS.shown);
      return;
    }
    setNudgeOpen(false);

    setSubmitting(true);
    setError("");

    try {
      const cleanGuests = guestNames.map((n) => n.trim()).filter(Boolean);

      // Single bulk request → single confirmation email covering every slot.
      const { getAttributionForSubmission } = await import("@/lib/attribution");
      const r = await fetch("/api/signups/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...posthogDistinctIdHeader() },
        body: JSON.stringify({
          campaign_id: eventId,
          session_ids: sessionsToSignUp,
          member_name: formData.name,
          member_email: formData.email,
          member_phone: formData.phone,
          signup_note: formData.note || undefined,
          guest_names: cleanGuests,
          ...(getAttributionForSubmission() || {}),
        }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(json?.error || "Failed to sign up for some sessions");
      }
      const slotResults: Array<{ session_id: string; error?: string }> = Array.isArray(json?.results) ? json.results : [];
      const firstFailure = slotResults.find((res) => res.error);
      if (firstFailure?.error) {
        throw new Error(firstFailure.error);
      }

      posthog?.capture("signup_completed", buildFunnelProps(funnelCtx, { session_count: sessionsToSignUp.length, has_email: Boolean(formData.email.trim()), has_phone: Boolean(formData.phone.trim()) }));

      // Redirect to dedicated success page with the primary cancel_token.
      const cancelToken = json?.primary_cancel_token;
      if (cancelToken) {
        router.push(`/signup-success/${cancelToken}?event=${eventId}`);
      } else {
        router.push(`/event/${eventId}`);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to sign up. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleNudgeAdd = () => {
    setNudgeOpen(false);
    captureNudge(EMAIL_NUDGE_EVENTS.add);
    emailInputRef.current?.focus();
  };
  const handleNudgeSkip = () => {
    setNudgeOpen(false);
    rememberEmailNudgeSkip();
    captureNudge(EMAIL_NUDGE_EVENTS.skip);
    void handleSignup(undefined, { skipNudge: true });
  };

  const handleCalendarDateClick = (day: number, year: number, month: number) => {
    // Toggle: tap same date to deselect
    if (selectedCalendarDate?.day === day && selectedCalendarDate?.year === year && selectedCalendarDate?.month === month) {
      setSelectedCalendarDate(null);
    } else {
      setSelectedCalendarDate({ day, year, month });
      // Scroll so the view toggle sits near the top, giving full room for the session list + action bar
      const el = document.getElementById("view-toggle");
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY - 16;
        window.scrollTo({ top, behavior: "smooth" });
      }
    }
  };

  // Filter sessions by selected calendar date
  const filteredSessions = selectedCalendarDate
    ? sessions.filter((s) => {
        const { day, year, month } = selectedCalendarDate;
        if (s.session_date) {
          const [sy, sm, sd] = s.session_date.split("-").map(Number);
          return sy === year && sm - 1 === month && sd === day;
        }
        return s.day_of_week === new Date(year, month, day).getDay();
      })
    : sessions;

  /** Signup count for capacity purposes: each signup = 1 spot regardless of guests.
   *  Guests are part of the same household and don't consume additional spots. */
  const sessionHeadcount = (s: SessionWithSignups) => (s.signups ?? []).length;

  const groupedByDate = filteredSessions
    .filter((s) => {
      // A full slot is normally hidden — but when the organizer chose to show
      // signups publicly, keep it visible so its signed-up names still render
      // (the slot renders as "Full" with a disabled button).
      if (!showSignupsPublicly && sessionHeadcount(s) >= s.capacity) return false;
      // Hide one-time slots whose date is in the past. Recurring slots
      // (session_date === null) keep repeating, so they're always shown.
      if (s.session_date) {
        const [y, m, d] = s.session_date.split("-").map(Number);
        const slotDate = new Date(y, m - 1, d);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (slotDate < today) return false;
      }
      return true;
    })
    .reduce((acc, session) => {
      const key = session.session_date ?? `dow-${session.day_of_week}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(session);
      return acc;
    }, {} as Record<string, SessionWithSignups[]>);

  const groupedSessions = Object.fromEntries(
    Object.entries(groupedByDate).sort(([a], [b]) => a.localeCompare(b))
  );

  // Single-session bypass: when exactly 1 session exists, skip the picker and show an inline form
  // Also applies to rsvp events which always have exactly 1 session
  const isSingleSession = (eventType === "spots" || eventType === "rsvp") && sessions.length === 1;
  const singleSession = isSingleSession ? sessions[0] : null;
  /** Slots the signup form will submit (same rule as handleSignup). */
  const signupSessionIds = isSingleSession ? [sessions[0].id] : selectedSessions;
  // capacity >= 999 means "unlimited" — never consider it full
  const singleSessionFull = singleSession
    ? singleSession.capacity < 999 && sessionHeadcount(singleSession) >= singleSession.capacity
    : false;

  /** Shared guest name fields rendered inside the signup form */
  const guestNameFields = (
    <div>
      <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1.5">
        Additional guests <span className="text-[#5A8399] font-normal">(optional)</span>
      </label>
      <p className="text-xs text-[#5A8399] mb-2">Add each person attending with you</p>
      <div className="space-y-2">
        {guestNames.map((name, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => {
                const next = [...guestNames];
                next[i] = e.target.value;
                setGuestNames(next);
              }}
              placeholder="Guest name"
              className="flex-1 text-sm text-[#0D2B35] px-[14px] py-[11px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399]/70"
              disabled={submitting}
            />
            <button
              type="button"
              onClick={() => setGuestNames(guestNames.filter((_, j) => j !== i))}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[#5A8399] hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
              aria-label="Remove guest"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        ))}
      </div>
      {guestNames.length < 10 && (
        <button
          type="button"
          onClick={() => setGuestNames([...guestNames, ""])}
          className="mt-2 flex items-center gap-1.5 text-sm font-medium text-[#0E96B0] hover:text-[#08647E] transition-colors"
          disabled={submitting}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add a guest
        </button>
      )}
    </div>
  );

  return {
    toggleSessionSelection,
    selectAllDaySessions,
    handleItemSignup,
    handleCustomItemSignup,
    handleSignup,
    handleNudgeAdd,
    handleNudgeSkip,
    handleCalendarDateClick,
    filteredSessions,
    sessionHeadcount,
    groupedByDate,
    groupedSessions,
    isSingleSession,
    singleSession,
    signupSessionIds,
    singleSessionFull,
    guestNameFields,
  };
}

export type EventPageView = LoadedEventPageCtx & ReturnType<typeof deriveEventPageView>;
