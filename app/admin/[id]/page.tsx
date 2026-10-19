"use client";

import { LoadingSpinner } from "@/components/LoadingSpinner";
import Toast from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import Navigation from "@/components/Navigation";
import Link from "next/link";
import PostCreateSupportPrompt from "@/components/PostCreateSupportPrompt";
import ReconnectGoogleBanner from "@/components/event/ReconnectGoogleBanner";
import CreatorRemindersNote from "@/components/CreatorRemindersNote";
import { useAdminEvent } from "@/components/admin/hooks/useAdminEvent";
import { deriveAdminEventView } from "@/components/admin/hooks/deriveAdminEventView";
import AdminCoverImage from "@/components/admin/sections/AdminCoverImage";
import AdminEventActions from "@/components/admin/sections/AdminEventActions";
import AdminEventStats from "@/components/admin/sections/AdminEventStats";
import AdminShareLinkRow from "@/components/admin/sections/AdminShareLinkRow";
import AdminItemsSignups from "@/components/admin/sections/AdminItemsSignups";
import AdminSessionsSignups from "@/components/admin/sections/AdminSessionsSignups";
import DeleteEventModal from "@/components/admin/sections/DeleteEventModal";


export default function AdminPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = useAdminEvent(params);
  const {
    calendarLastError,
    confirmDialog,
    coverInputRef,
    coverUploading,
    digestEnabled,
    error,
    event,
    eventId,
    eventType,
    handleCancelRemove,
    handleCoverChange,
    instantEnabled,
    justCreated,
    loading,
    router,
    sendOrganizerReportNow,
    sendingReport,
    setShowToast,
    showToast,
    toastMessage,
    viewerCanManage,
  } = ctx;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4FAFB] flex items-center justify-center">
        <LoadingSpinner size="xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F4FAFB] flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-[0_8px_32px_rgba(8,100,126,0.10)] p-10 max-w-md w-full text-center">
          <h1 className="font-serif text-2xl text-[#0D2B35] mb-3">Event not found</h1>
          <p className="text-sm text-[#5A8399] mb-6">{error}</p>
          <button onClick={() => router.push("/dashboard")}
            className="text-sm font-semibold px-6 py-2.5 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.35)] hover:-translate-y-0.5 transition-all">
            Back to My Events
          </button>
        </div>
      </div>
    );
  }

  if (!event) return null;

  const view = { ...ctx, event, ...deriveAdminEventView({ ...ctx, event }) };
  const {
    coverEnabled,
    handleConfirmRemove,
  } = view;

  return (
    <>
      <Toast
        message={toastMessage}
        show={showToast}
        onClose={() => setShowToast(false)}
        duration={toastMessage.includes("Report sent") ? 8000 : 3000}
      />
      
      {confirmDialog && (
        <ConfirmDialog
          title={`Remove ${confirmDialog.memberName}?`}
          body={
            confirmDialog.isItemSignup
              ? `They will be taken off ${confirmDialog.contextLabel}. This cannot be undone.`
              : `They will be taken off ${confirmDialog.contextLabel} and the calendar event will update. This cannot be undone.`
          }
          confirmLabel="Remove"
          onConfirm={handleConfirmRemove}
          onCancel={handleCancelRemove}
        />
      )}
      
      <Navigation />
      <main className="min-h-screen bg-[#F4FAFB] px-6 py-10 md:px-10">
        <div className="max-w-5xl mx-auto">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0E96B0] hover:text-[#08647E] mb-6 transition-colors no-underline"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
            Back to My Events
          </Link>

          {/* Prominent Preview CTA — primary post-creation action */}
          <Link
            href={`/event/${eventId}`}
            className="flex items-center justify-between gap-4 mb-6 px-5 py-4 rounded-2xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_8px_24px_rgba(14,150,176,0.32)] hover:-translate-y-0.5 transition-all no-underline"
          >
            <div className="min-w-0">
              <div className="text-base font-semibold leading-tight">Preview your event</div>
              <div className="text-[13px] opacity-90 leading-snug mt-0.5">See exactly what attendees will see when they sign up.</div>
            </div>
            <span className="inline-flex items-center gap-1.5 flex-shrink-0 text-sm font-semibold bg-white/15 hover:bg-white/25 transition-colors rounded-full px-4 py-2">
              Open
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </span>
          </Link>

          <PostCreateSupportPrompt visible={justCreated} />

          {/* Event header card */}
          <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden mb-6">
            <AdminCoverImage ctx={view} />
            {coverEnabled && (
              <input
                ref={coverInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={handleCoverChange}
                disabled={coverUploading}
                className="hidden"
              />
            )}
            <div className="p-7">
            <ReconnectGoogleBanner
              campaignId={eventId}
              organizationId={(event as { organization_id?: string | null }).organization_id}
              lastError={calendarLastError}
            />
            <AdminEventActions ctx={view} />

            {/* Stats */}
            <AdminEventStats ctx={view} />

            {/* Settings live on Edit only; Manage links there so there is one place to change them. */}
            <div className="mb-4 rounded-xl border border-[#0E96B0]/18 bg-[#F8FCFD] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#0D2B35] mb-0.5">Event settings</div>
                <div className="text-[11px] text-[#5A8399] leading-snug">
                  Visibility, notifications, Google Calendar, leader, time zone and guests are in Edit details.
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
                {(digestEnabled || instantEnabled) && (
                  <button
                    type="button"
                    onClick={sendOrganizerReportNow}
                    disabled={sendingReport}
                    className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border-[1.5px] border-[#0E96B0]/35 text-[#08647E] bg-white/60 hover:border-[#0E96B0] hover:bg-white transition-all disabled:opacity-60"
                  >
                    {sendingReport ? "Sending…" : "Send organizer report now"}
                  </button>
                )}
                <Link
                  href={`/edit/${eventId}#event-settings`}
                  className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white no-underline"
                >
                  Edit settings
                </Link>
              </div>
            </div>

            <AdminShareLinkRow ctx={view} />
            <CreatorRemindersNote viewerCanManage={viewerCanManage} eventType={eventType} />
            </div>{/* end p-7 */}
          </div>

          {/* Items list — items type */}
          <AdminItemsSignups ctx={view} />

          {/* Sessions — spots/rsvp type */}
          <AdminSessionsSignups ctx={view} />
        </div>

        <DeleteEventModal ctx={view} />
      </main>
    </>
  );
}
