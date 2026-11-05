"use client";

import { formatSyncTime } from "@/components/admin/admin-page-shared";
import Link from "next/link";
import { downloadEventQr } from "@/lib/download-qr";
import { COVER_SIZE_HINT } from "@/lib/cover-position";
import { type AdminEventView } from "@/components/admin/hooks/deriveAdminEventView";
import { useRef } from "react";
import { earliestYmd } from "@/lib/date-shift";
import EventActionsSheet, { eventSheetSubtitle, type EventSheetGroup } from "@/components/event-actions/EventActionsSheet";
import {
  DotsVerticalIcon,
  EyeIcon,
  GearIcon,
  ImageIcon,
  LinkIcon,
  PencilIcon,
  PrinterIcon,
  QrIcon,
} from "@/components/event-actions/icons";

/** Title row actions: phone action row plus More sheet, and the desktop buttons. */
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
    eventType,
    isWardBrand,
    items,
    moreMenuOpen,
    posthog,
    setMoreMenuOpen,
    setShowDeleteModal,
    setShowToast,
    setToastMessage,
    sessions,
    shareableLink,
    totalCapacity,
    totalSignups,
  } = ctx;
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const canAddCover = coverEnabled && !coverUrl && !coverPreview;

  const copyLink = (message = "Link copied") => {
    navigator.clipboard.writeText(shareableLink);
    posthog?.capture("event_shared", { event_id: eventId, campaign_id: eventId, org_id: (event as { organization_id?: string | null } | null)?.organization_id ?? null });
    setToastMessage(message);
    setShowToast(true);
  };

  const downloadQr = async () => {
    try {
      await downloadEventQr(eventId, event.name);
    } catch (err) {
      console.error("QR download failed:", err);
    }
  };

  const isItems = eventType === "items";
  const claimedItems = items.filter((it) => (it.item_signups ?? []).length > 0).length;
  const subtitle = eventSheetSubtitle({
    ymd: earliestYmd([
      event.event_date,
      ...(Array.isArray(event.event_dates) ? event.event_dates : []),
      ...sessions.map((s) => s.session_date),
    ]),
    isItems,
    filled: isItems ? claimedItems : totalSignups,
    total: isItems ? items.length : totalCapacity,
  });

  const sheetGroups: EventSheetGroup[] = [
    {
      heading: "Edit",
      actions: [
        { key: "edit", label: "Edit event", helper: "Name, dates, times and slots", icon: <PencilIcon />, href: `/edit/${eventId}` },
        { key: "settings", label: "Event settings", helper: "Visibility, reminders and Google Calendar", icon: <GearIcon />, href: `/edit/${eventId}#event-settings` },
        ...(canAddCover
          ? [{ key: "cover", label: "Add cover photo", helper: "Shows at the top of the signup page", icon: <ImageIcon />, onSelect: () => coverInputRef.current?.click() }]
          : []),
      ],
    },
    {
      heading: "Share",
      actions: [
        {
          key: "copy",
          label: "Copy link",
          helper: isWardBrand ? "Send it to your ward by email or text" : "Send it to your group by email or text",
          icon: <LinkIcon />,
          onSelect: () => copyLink(),
        },
        {
          key: "preview",
          label: "Preview signup page",
          helper: isWardBrand ? "See what ward members see" : "See what people see when they sign up",
          icon: <EyeIcon />,
          href: `/event/${eventId}`,
        },
        { key: "qr", label: "Download QR code", helper: "For a slide, bulletin or handout", icon: <QrIcon />, onSelect: () => void downloadQr() },
        { key: "flyer", label: "Print flyer", helper: "A printable page with the QR code", icon: <PrinterIcon />, href: `/event/${eventId}/flyer` },
      ],
    },
  ];

  return (
    <div className="mb-6">
      <div className={`flex items-center justify-end gap-2 sm:gap-3 flex-wrap ${calendarSyncEnabled && calendarLastSyncedAt ? "mb-3" : "sm:mb-3"}`}>
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
        {canAddCover && (
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
          onClick={() => void downloadQr()}
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
          onClick={() => copyLink()}
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
      {/* Phone: the two direct actions plus More, which opens the grouped sheet. */}
      <div className="mt-4 flex items-center gap-2 sm:hidden">
        <button
          type="button"
          onClick={() => copyLink()}
          className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#08647E] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#054F64] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E96B0]"
        >
          <LinkIcon className="size-4" />
          Copy link
        </button>
        <Link
          href={`/edit/${eventId}`}
          className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl border-[1.5px] border-[#0E96B0]/40 bg-white px-4 text-sm font-semibold text-[#08647E] no-underline transition-colors hover:border-[#0E96B0] hover:bg-[#E6F7FB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E96B0]"
        >
          <PencilIcon className="size-4" />
          Edit
        </Link>
        <button
          ref={moreButtonRef}
          type="button"
          onClick={() => setMoreMenuOpen((o) => !o)}
          aria-label={`More actions for ${event.name}`}
          aria-haspopup="dialog"
          aria-expanded={moreMenuOpen}
          className="ml-auto inline-flex size-11 flex-shrink-0 items-center justify-center rounded-xl border-[1.5px] border-[#0E96B0]/40 bg-white text-[#08647E] transition-colors hover:border-[#0E96B0] hover:bg-[#E6F7FB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E96B0]"
        >
          <DotsVerticalIcon className="size-5" />
        </button>
      </div>
      {moreMenuOpen && (
        <EventActionsSheet
          title={event.name}
          subtitle={subtitle}
          groups={sheetGroups}
          onDelete={() => setShowDeleteModal(true)}
          onClose={() => setMoreMenuOpen(false)}
          triggerRef={moreButtonRef}
        />
      )}
      {event.description && (
        <p className="text-sm text-[#5A8399] mt-2 leading-relaxed whitespace-pre-wrap">
          {event.description}
        </p>
      )}
    </div>
  );
}
