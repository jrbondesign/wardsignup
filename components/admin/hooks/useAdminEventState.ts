"use client";

import { use, useEffect, useRef, useState } from "react";
import { useBrand } from "@/components/BrandProvider";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { SessionWithSignups } from "@/components/admin/admin-page-shared";
import { CampaignItemWithSignups } from "@/lib/types";

/** State for the Manage event page, plus the small UI effects that only touch it. */
export function useAdminEventState(params: Promise<{ id: string }>) {
  const { id: eventId } = use(params);
  const brand = useBrand();
  const isWardBrand = brand.id === "wardsignup";
  const router = useRouter();
  const posthog = usePostHog();
  const [justCreated, setJustCreated] = useState(false);

  const [event, setEvent] = useState<any>(null);
  const [eventType, setEventType] = useState<"spots" | "items" | "rsvp">("spots");
  /** Set only after the creator / manager access check passes. */
  const [viewerCanManage, setViewerCanManage] = useState(false);
  const [sessions, setSessions] = useState<SessionWithSignups[]>([]);
  const [items, setItems] = useState<CampaignItemWithSignups[]>([]);
  const [customSignups, setCustomSignups] = useState<{ id: string; member_name: string; member_email: string | null; custom_label: string | null; signup_note: string | null; quantity: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shareableLink, setShareableLink] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("Link copied to clipboard!");
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [instantEnabled, setInstantEnabled] = useState(false);
  const [showSignupsPublicly, setShowSignupsPublicly] = useState(false);
  const [listOnDirectory, setListOnDirectory] = useState(true);
  const [allowGuests, setAllowGuests] = useState(true);
  const [showCapacityPublicly, setShowCapacityPublicly] = useState(true);
  const [eventTimezone, setEventTimezone] = useState("America/Phoenix");
  const [leaderName, setLeaderName] = useState("");
  const [leaderEmail, setLeaderEmail] = useState("");
  const leaderSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  
  // Signup options menu and confirm dialog state
  const [openMenuSignupId, setOpenMenuSignupId] = useState<string | null>(null);
  const [openMenuButton, setOpenMenuButton] = useState<HTMLButtonElement | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    signupId: string;
    memberName: string;
    contextLabel: string;
    isItemSignup: boolean;
  } | null>(null);
  const menuButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverPosition, setCoverPosition] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(false);
  const [calendarId, setCalendarId] = useState("");
  const [calendarName, setCalendarName] = useState("");
  const [inviteLeader, setInviteLeader] = useState(false);
  const [calendarLastSyncedAt, setCalendarLastSyncedAt] = useState<string | null>(null);
  const [calendarLastError, setCalendarLastError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("created") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads window.location after mount (not available during SSR) and strips the flag
      setJustCreated(true);
      // Drop the query flag so refresh / share doesn't keep re-triggering the prompt UI state.
      params.delete("created");
      const next = params.toString();
      const path = `${window.location.pathname}${next ? `?${next}` : ""}`;
      window.history.replaceState({}, "", path);
    }
  }, []);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreMenuOpen]);

  return {
    eventId,
    brand,
    isWardBrand,
    router,
    posthog,
    justCreated,
    setJustCreated,
    event,
    setEvent,
    eventType,
    setEventType,
    viewerCanManage,
    setViewerCanManage,
    sessions,
    setSessions,
    items,
    setItems,
    customSignups,
    setCustomSignups,
    loading,
    setLoading,
    error,
    setError,
    shareableLink,
    setShareableLink,
    showDeleteModal,
    setShowDeleteModal,
    deleting,
    setDeleting,
    showToast,
    setShowToast,
    toastMessage,
    setToastMessage,
    digestEnabled,
    setDigestEnabled,
    instantEnabled,
    setInstantEnabled,
    showSignupsPublicly,
    setShowSignupsPublicly,
    listOnDirectory,
    setListOnDirectory,
    allowGuests,
    setAllowGuests,
    showCapacityPublicly,
    setShowCapacityPublicly,
    eventTimezone,
    setEventTimezone,
    leaderName,
    setLeaderName,
    leaderEmail,
    setLeaderEmail,
    leaderSaveTimer,
    visibilityOpen,
    setVisibilityOpen,
    notificationsOpen,
    setNotificationsOpen,
    settingsOpen,
    setSettingsOpen,
    calendarOpen,
    setCalendarOpen,
    registrationOpen,
    setRegistrationOpen,
    sendingReport,
    setSendingReport,
    moreMenuOpen,
    setMoreMenuOpen,
    openMenuSignupId,
    setOpenMenuSignupId,
    openMenuButton,
    setOpenMenuButton,
    confirmDialog,
    setConfirmDialog,
    menuButtonRefs,
    moreMenuRef,
    logoUrl,
    setLogoUrl,
    coverUrl,
    setCoverUrl,
    coverPosition,
    setCoverPosition,
    coverInputRef,
    coverPreview,
    setCoverPreview,
    coverUploading,
    setCoverUploading,
    calendarSyncEnabled,
    setCalendarSyncEnabled,
    calendarId,
    setCalendarId,
    calendarName,
    setCalendarName,
    inviteLeader,
    setInviteLeader,
    calendarLastSyncedAt,
    setCalendarLastSyncedAt,
    calendarLastError,
    setCalendarLastError,
  };
}

export type AdminEventState = ReturnType<typeof useAdminEventState>;
