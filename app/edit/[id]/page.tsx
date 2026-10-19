"use client";

import Navigation from "@/components/Navigation";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Toast from "@/components/Toast";
import Link from "next/link";
import { type CreateFormState } from "@/lib/create-form-state";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useEditEvent } from "@/components/edit/hooks/useEditEvent";
import EditItemsEvent from "@/components/edit/sections/EditItemsEvent";
import SessionsHeader from "@/components/edit/sections/SessionsHeader";
import RescheduleForm from "@/components/edit/sections/RescheduleForm";
import BulkAddSessionsForm from "@/components/edit/sections/BulkAddSessionsForm";
import AddSessionForm from "@/components/edit/sections/AddSessionForm";
import SessionsList from "@/components/edit/sections/SessionsList";
import RescheduleConfirmDialog from "@/components/edit/sections/RescheduleConfirmDialog";
import DeleteSessionsConfirmDialog from "@/components/edit/sections/DeleteSessionsConfirmDialog";
import DayActionMenu from "@/components/edit/sections/DayActionMenu";
import SectionActionMenu from "@/components/edit/sections/SectionActionMenu";
import SlotActionMenu from "@/components/edit/sections/SlotActionMenu";


export default function EditEventPage() {
  const ctx = useEditEvent();
  const {
    confirmDialog,
    error,
    eventDescription,
    eventId,
    eventName,
    eventTimezone,
    handleSave,
    isItemsEvent,
    lastSavedAt,
    loading,
    optionalSettingsEl,
    router,
    savedSnapshot,
    saving,
    sessions,
    setConfirmDialog,
    setEventDescription,
    setEventName,
    setShowAddSession,
    setShowBulk,
    setShowReschedule,
    setShowToast,
    settingsStatus,
    showAddSession,
    showBulk,
    showReschedule,
    showToast,
    toastMessage,
  } = ctx;

  if (loading) {
    return (
      <>
        <Navigation />
        <main className="min-h-screen bg-[#F4FAFB] flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-4">
            <LoadingSpinner size="lg" />
            <p className="text-[15px] text-[#5A8399]">Loading event…</p>
          </div>
        </main>
      </>
    );
  }

  if (error && !eventName) {
    return (
      <>
        <Navigation />
        <main className="min-h-screen bg-[#F4FAFB] flex items-center justify-center p-8">
          <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-10 text-center max-w-sm w-full">
            <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-red-500">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h1 className="font-serif text-[20px] text-[#0D2B35] mb-5">{error}</h1>
            <button
              onClick={() => router.replace("/dashboard")}
              className="text-base font-semibold px-6 py-3 rounded-xl text-white bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] shadow-[0_6px_20px_rgba(14,150,176,0.38)] hover:-translate-y-0.5 transition-all"
            >
              Back to My Events
            </button>
          </div>
        </main>
      </>
    );
  }

  // ── Items event UI ────────────────────────────────────────────────────────
  if (isItemsEvent) {
    return <EditItemsEvent ctx={ctx} />;
  }

  const hasUnsavedChanges =
    savedSnapshot !== null &&
    savedSnapshot !==
      JSON.stringify({ name: eventName, description: eventDescription, eventTimezone, sessions });

  return (
    <>
      <Toast
        message={toastMessage}
        show={showToast}
        onClose={() => setShowToast(false)}
        duration={toastMessage.includes("Report sent") ? 8000 : 3000}
      />
      <Navigation />
      <main className="min-h-screen bg-[#F4FAFB] p-4 pb-28 md:p-8 md:pb-28">
        <div className="max-w-4xl mx-auto">
          <Link
            href={`/admin/${eventId}`}
            replace
            aria-label={hasUnsavedChanges ? "Cancel editing" : "Back to event"}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0E96B0] hover:text-[#08647E] mb-5 transition-colors no-underline"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
            {hasUnsavedChanges ? "Cancel" : "Back to event"}
          </Link>
          <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden">
            {/* Future: Cover image support */}
            <div className="p-4 md:p-8">
            <div className="flex items-center gap-3 mb-4">
              {/* Future: Org logo support */}
              <h1 className="font-serif text-[28px] text-[#0D2B35]">Edit details</h1>
              <span role="status" aria-live="polite" className="ml-auto text-[11px] font-semibold rounded-full px-2.5 py-1 border border-[rgba(14,150,176,0.25)] text-[#08647E] bg-[#F8FCFD] whitespace-nowrap">
                {saving
                  ? "Saving…"
                  : (savedSnapshot !== null && savedSnapshot !== JSON.stringify({ name: eventName, description: eventDescription, eventTimezone, sessions }))
                    ? "Unsaved changes"
                    : lastSavedAt
                      ? "All changes saved"
                      : "No changes yet"}
              </span>
            </div>

            <form onSubmit={handleSave} className="space-y-6">

              {/* Event Name */}
              <div id="edit-event-name">
                <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
                  Event Name *
                </label>
                <input
                  type="text"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="e.g., Spring Volunteer Week 2026"
                  className="w-full text-base text-[#0D2B35] px-[18px] py-[14px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                  required
                />
              </div>

              {/* Event Description */}
              <div>
                <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={eventDescription}
                  onChange={(e) => setEventDescription(e.target.value)}
                  placeholder="Add details about this event..."
                  rows={4}
                  className="w-full text-base text-[#0D2B35] px-[18px] py-[14px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70 resize-none"
                />
              </div>

              <div id="event-settings" className="scroll-mt-20">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[13px] font-semibold text-[#2E5566]">Settings</div>
                  <span role="status" aria-live="polite" className="text-[11px] text-[#5A8399]">
                    {settingsStatus === "saving" ? "Saving…" : settingsStatus === "saved" ? "Saved" : settingsStatus === "error" ? "Not saved" : "Settings save as you change them"}
                  </span>
                </div>
                {optionalSettingsEl(((event as { event_type?: CreateFormState["eventType"] } | null)?.event_type) || "spots", true)}
              </div>

              {/* Sessions */}
              <SessionsHeader ctx={ctx} />

              {/* Reschedule All Sessions */}
              <div id="reschedule-section" className="hidden">
                <button type="button" onClick={() => setShowReschedule(!showReschedule)}>Toggle</button>
              </div>

                <RescheduleForm ctx={ctx} />

              {/* Add sessions tools (opened via "Add sessions") */}
              <>
                <div className="hidden">
                  <button type="button" onClick={() => setShowBulk(!showBulk)}>Toggle</button>
                </div>

                <BulkAddSessionsForm ctx={ctx} />

                {/* Add one session (opened via "Add sessions") */}
                <div className="hidden">
                  <button type="button" onClick={() => setShowAddSession(!showAddSession)}>Toggle</button>
                </div>

                  <AddSessionForm ctx={ctx} />

                <SessionsList ctx={ctx} />
              </>

              {/* Section suggestions for the inline class editors */}
              <datalist id="edit-session-sections">
                {Array.from(new Set(sessions.map((s) => (s.section ?? "").trim()).filter(Boolean))).map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>

              {error && (
                <div
                  id="edit-inline-error"
                  className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm"
                >
                  {error}
                </div>
              )}

              {/* Spacer so content isn't hidden behind sticky bar */}
              <div className="h-4" />
            </form>
            </div>{/* end p-4 md:p-8 */}
          </div>
        </div>
      </main>

      {/* Reschedule confirmation modal */}
      <RescheduleConfirmDialog ctx={ctx} />

      {/* Delete sessions confirmation modal (when removed sessions have signups) */}
      <DeleteSessionsConfirmDialog ctx={ctx} />

      {/* Day menu */}
      <DayActionMenu ctx={ctx} />

      {/* Section menu */}
      <SectionActionMenu ctx={ctx} />

      {/* Slot menu */}
      <SlotActionMenu ctx={ctx} />

      {/* Confirm dialog */}
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          body={confirmDialog.body}
          confirmLabel={confirmDialog.confirmLabel}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {/* Sticky bottom save bar — only shown when there are unsaved changes */}
      {savedSnapshot !==
        JSON.stringify({ name: eventName, description: eventDescription, eventTimezone, sessions }) &&
        savedSnapshot !== null && (
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-sm border-t border-[rgba(14,150,176,0.14)] shadow-[0_-4px_24px_rgba(8,100,126,0.10)]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex gap-3">
          <button
            type="button"
            onClick={() => router.replace(`/admin/${eventId}`)}
            className="flex-1 text-base font-semibold px-6 py-3 rounded-xl border-[1.5px] border-[#0E96B0]/40 text-[#08647E] bg-white hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={(e) => {
              e.preventDefault();
              const form = document.querySelector("form");
              if (form) form.requestSubmit();
            }}
            className={`flex-1 text-base font-semibold px-6 py-3 rounded-xl text-white border-none cursor-pointer shadow-[0_4px_14px_rgba(14,150,176,0.30)] transition-all ${
              saving
                ? "bg-gradient-to-br from-[#1D9E75] to-[#0F6E56] cursor-default"
                : "bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(14,150,176,0.40)]"
            }`}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
      )}
    </>
  );
}
