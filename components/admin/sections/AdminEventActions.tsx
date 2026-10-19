"use client";

import { formatSyncTime } from "@/components/admin/admin-page-shared";
import Link from "next/link";
import { downloadEventQr } from "@/lib/download-qr";
import { COVER_SIZE_HINT } from "@/lib/cover-position";
import { type AdminEventView } from "@/components/admin/hooks/deriveAdminEventView";

/** Title row actions: mobile More menu and desktop buttons. */
export default function AdminEventActions({ ctx }: { ctx: AdminEventView }) {
  const {
    calendarLastSyncedAt,
    calendarSyncEnabled,
    coverEnabled,
    coverInputRef,
    coverPreview,
    coverUploading,
    coverUrl,
    event,
    eventId,
    moreMenuOpen,
    moreMenuRef,
    posthog,
    setMoreMenuOpen,
    setShowDeleteModal,
    setShowToast,
    setToastMessage,
    shareableLink,
  } = ctx;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-end gap-2 sm:gap-3 flex-wrap mb-3">
        {calendarSyncEnabled && calendarLastSyncedAt && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-[#0E96B0] bg-[#E6F7FB] border border-[#0E96B0]/20 rounded-full whitespace-nowrap flex-shrink-0 mr-auto">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            On Google Calendar · {formatSyncTime(calendarLastSyncedAt)}
          </div>
        )}
        {/* Mobile: actions in More menu */}
        <div className="relative flex-shrink-0 sm:hidden" ref={moreMenuRef}>
            <button
              type="button"
              onClick={() => setMoreMenuOpen((o) => !o)}
              aria-expanded={moreMenuOpen}
              aria-haspopup="menu"
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl border-[1.5px] border-[#0E96B0]/35 text-[#08647E] bg-white hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all"
            >
              More
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 transition-transform ${moreMenuOpen ? "rotate-180" : ""}`}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {moreMenuOpen && (
              <div
                className="absolute right-0 mt-1 min-w-[12rem] w-max max-w-[min(18rem,calc(100vw-3rem))] bg-white rounded-xl shadow-[0_8px_28px_rgba(8,100,126,0.16)] border border-[#0E96B0]/10 py-1 z-20"
                role="menu"
              >
                <Link
                  href={`/edit/${eventId}`}
                  className="block px-4 py-2.5 text-sm text-[#2E5566] hover:bg-[#E6F7FB] hover:text-[#0D2B35] transition-colors no-underline"
                  onClick={() => setMoreMenuOpen(false)}
                  role="menuitem"
                >
                  Edit
                </Link>
                <Link
                  href={`/event/${eventId}`}
                  className="block px-4 py-2.5 text-sm text-[#2E5566] hover:bg-[#E6F7FB] hover:text-[#0D2B35] transition-colors no-underline"
                  onClick={() => setMoreMenuOpen(false)}
                  role="menuitem"
                >
                  Preview
                </Link>
                <Link
                  href={`/event/${eventId}/flyer`}
                  className="block px-4 py-2.5 text-sm text-[#2E5566] hover:bg-[#E6F7FB] hover:text-[#0D2B35] transition-colors no-underline"
                  onClick={() => setMoreMenuOpen(false)}
                  role="menuitem"
                >
                  Print flyer
                </Link>
                {coverEnabled && !coverUrl && !coverPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      coverInputRef.current?.click();
                    }}
                    className="block w-full text-left px-4 py-2.5 text-sm text-[#2E5566] hover:bg-[#E6F7FB] hover:text-[#0D2B35] transition-colors"
                    role="menuitem"
                  >
                    Add cover
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    setMoreMenuOpen(false);
                    try {
                      await downloadEventQr(eventId, event.name);
                    } catch (err) {
                      console.error("QR download failed:", err);
                    }
                  }}
                  className="block w-full text-left px-4 py-2.5 text-sm text-[#2E5566] hover:bg-[#E6F7FB] hover:text-[#0D2B35] transition-colors"
                  role="menuitem"
                >
                  Download QR code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(shareableLink);
                    posthog?.capture("event_shared", { event_id: eventId });
                    setToastMessage("Link copied to clipboard!");
                    setShowToast(true);
                    setMoreMenuOpen(false);
                  }}
                  className="block w-full text-left px-4 py-2.5 text-sm text-[#2E5566] hover:bg-[#E6F7FB] hover:text-[#0D2B35] transition-colors"
                  role="menuitem"
                >
                  Copy link
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(true);
                    setMoreMenuOpen(false);
                  }}
                  className="block w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                  role="menuitem"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        <div className="hidden sm:flex flex-shrink-0 flex-row flex-wrap items-center justify-end gap-x-3 gap-y-2">
        <Link
          href={`/edit/${eventId}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2E5566] hover:text-[#0E96B0] transition-colors no-underline"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 flex-shrink-0 opacity-90">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Edit
        </Link>
        <Link
          href={`/event/${eventId}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2E5566] hover:text-[#0E96B0] transition-colors no-underline"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 flex-shrink-0 opacity-90">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          Preview
        </Link>
        <Link
          href={`/event/${eventId}/flyer`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2E5566] hover:text-[#0E96B0] transition-colors no-underline"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 flex-shrink-0 opacity-90">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          Print flyer
        </Link>
        {coverEnabled && !coverUrl && !coverPreview && (
        <button
          type="button"
          onClick={() => coverInputRef.current?.click()}
          disabled={coverUploading}
          title={COVER_SIZE_HINT}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2E5566] hover:text-[#0E96B0] transition-colors disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 flex-shrink-0 opacity-90">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          Add cover
        </button>
        )}
        <button
          type="button"
          onClick={async () => {
            try {
              await downloadEventQr(eventId, event.name);
            } catch (err) {
              console.error("QR download failed:", err);
            }
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2E5566] hover:text-[#0E96B0] transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 flex-shrink-0 opacity-90">
            <rect x="3" y="3" width="7" height="7"/>
            <rect x="14" y="3" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
            <line x1="14" y1="14" x2="14" y2="17"/>
            <line x1="17" y1="14" x2="21" y2="14"/>
            <line x1="14" y1="21" x2="17" y2="21"/>
            <line x1="21" y1="17" x2="21" y2="21"/>
          </svg>
          Download QR
        </button>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(shareableLink);
            posthog?.capture("event_shared", { event_id: eventId });
            setToastMessage("Link copied to clipboard!");
            setShowToast(true);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2E5566] hover:text-[#0E96B0] transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 flex-shrink-0 opacity-90">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy link
        </button>
        <button
          type="button"
          onClick={() => setShowDeleteModal(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-600 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 flex-shrink-0 opacity-90">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          Delete
        </button>
        </div>
      </div>
      <h1 className="font-serif text-[clamp(24px,3.5vw,36px)] text-[#0D2B35] tracking-[-0.4px] leading-tight">
        {event.name}
      </h1>
      {event.description && (
        <p className="text-sm text-[#5A8399] mt-2 leading-relaxed whitespace-pre-wrap">
          {event.description}
        </p>
      )}
    </div>
  );
}
