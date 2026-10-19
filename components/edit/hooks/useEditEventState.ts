"use client";

import { useBrand } from "@/components/BrandProvider";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ItemInput, SessionData, emptyItemInput } from "@/components/edit/edit-page-shared";

/** All editor state for the Edit event page, plus the small UI effects that only touch that state. */
export function useEditEventState() {
  const brand = useBrand();
  const router = useRouter();
  const params = useParams();
  const eventId = params.id as string;

  const [eventName, setEventName] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventTimezone, setEventTimezone] = useState("America/Phoenix");
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [loadedSessionIds, setLoadedSessionIds] = useState<string[]>([]);
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [instantEnabled, setInstantEnabled] = useState(false);
  const [showSignupsPublicly, setShowSignupsPublicly] = useState(false);
  const [listOnDirectory, setListOnDirectory] = useState(true);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [allowGuests, setAllowGuests] = useState(true);
  const [showCapacityPublicly, setShowCapacityPublicly] = useState(true);
  const [leaderName, setLeaderName] = useState("");
  const [leaderEmail, setLeaderEmail] = useState("");
  // Debounce leader-field auto-save so we don't PATCH on every keystroke.
  const leaderSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Calendar sync state
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(false);
  const [calendarId, setCalendarId] = useState("");
  const [calendarName, setCalendarName] = useState("");
  const [inviteLeader, setInviteLeader] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarLastSyncedAt, setCalendarLastSyncedAt] = useState<string | null>(null);
  const [calendarLastError, setCalendarLastError] = useState<string | null>(null);
  
  const [sendingReport, setSendingReport] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverPosition, setCoverPosition] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Reschedule state
  const [showReschedule, setShowReschedule] = useState(false);
  const [showRescheduleConfirm, setShowRescheduleConfirm] = useState(false);
  const [signupCount, setSignupCount] = useState(0);
  /** Signup count per session id, so Edit can show who is in a slot before it is removed. */
  const [signupsBySession, setSignupsBySession] = useState<Record<string, number>>({});
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [settingsStatus, setSettingsStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [rescheduleStart, setRescheduleStart] = useState<Date | null>(null);
  const [rescheduleEnd, setRescheduleEnd] = useState<Date | null>(null);
  const [rescheduleTime, setRescheduleTime] = useState("17:00");
  const [rescheduleEndTime, setRescheduleEndTime] = useState("18:00");
  const [isTithingReschedule, setIsTithingReschedule] = useState(false);
  const [rescheduleDays, setRescheduleDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [rescheduleCapacity, setRescheduleCapacity] = useState(1);
  const [rescheduleCapacityDraft, setRescheduleCapacityDraft] = useState<string | undefined>(undefined);
  const [rescheduleLocation, setRescheduleLocation] = useState("");
  const [rescheduleNotes, setRescheduleNotes] = useState("");
  const [tithingDays, setTithingDays] = useState<number[]>([0]);
  const [tithingDuration, setTithingDuration] = useState(15);
  const [tithingCapacity, setTithingCapacity] = useState(1);
  const [tithingCapacityDraft, setTithingCapacityDraft] = useState<string | undefined>(undefined);
  const [customDuration, setCustomDuration] = useState("");

  // Add individual session state
  const [showAddSession, setShowAddSession] = useState(false);
  const [newSessionDate, setNewSessionDate] = useState("");
  const [newSessionDateObj, setNewSessionDateObj] = useState<Date | null>(null);
  const [newSessionDayOfWeek, setNewSessionDayOfWeek] = useState(0);
  const [newSessionUseDate, setNewSessionUseDate] = useState(true);
  const [newSessionTime, setNewSessionTime] = useState("19:00");
  const [newSessionEndTime, setNewSessionEndTime] = useState("");
  const [newSessionCapacity, setNewSessionCapacity] = useState(1);
  const [newSessionLocation, setNewSessionLocation] = useState("");
  const [newSessionNotes, setNewSessionNotes] = useState("");
  const [newSessionSection, setNewSessionSection] = useState("");
  const [newSessionLabel, setNewSessionLabel] = useState("");

  // Bulk schedule state
  const [showBulk, setShowBulk] = useState(false);
  const [bulkDays, setBulkDays] = useState<number[]>([]);
  const [bulkTime, setBulkTime] = useState("19:00");
  const [bulkEndTime, setBulkEndTime] = useState("");
  const [bulkCapacity, setBulkCapacity] = useState(1);
  const [bulkCapacityDraft, setBulkCapacityDraft] = useState<string | undefined>(undefined);
  const [bulkLocation, setBulkLocation] = useState("");
  const [bulkNotes, setBulkNotes] = useState("");
  const [bulkStartDate, setBulkStartDate] = useState("");
  const [bulkEndDate, setBulkEndDate] = useState("");
  const [bulkRangeStart, setBulkRangeStart] = useState<Date | null>(null);
  const [bulkRangeEnd, setBulkRangeEnd] = useState<Date | null>(null);

  const [showDeleteSessionsConfirm, setShowDeleteSessionsConfirm] = useState(false);
  const [deleteSessionsSignupCount, setDeleteSessionsSignupCount] = useState(0);
  const pendingDeleteSessionIdsRef = useRef<string[] | null>(null);
  const allowDestructiveDeletesOnceRef = useRef(false);
  const [editingSessionIndex, setEditingSessionIndex] = useState<number | null>(null);
  /** Flat-array index of the slot being dragged to reorder, or null. */
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  /** Lets users clear the Spots field while typing; committed on blur / Done. */
  const [capacityInputDraft, setCapacityInputDraft] = useState<Record<number, string>>({});
  const [showAddSessionsMenu, setShowAddSessionsMenu] = useState(false);
  const addSessionsMenuRef = useRef<HTMLDivElement>(null);

  // Action menu state
  const [dayMenuGroupKey, setDayMenuGroupKey] = useState<string | null>(null);
  const [dayMenuButtonEl, setDayMenuButtonEl] = useState<HTMLElement | null>(null);
  const [slotMenuIndex, setSlotMenuIndex] = useState<number | null>(null);
  const [slotMenuButtonEl, setSlotMenuButtonEl] = useState<HTMLElement | null>(null);

  // Second step state for day menu actions
  const [dayMenuSecondStep, setDayMenuSecondStep] = useState<"change-date" | "duplicate-day" | null>(null);
  const [dayMenuSecondStepDate, setDayMenuSecondStepDate] = useState("");

  // Reorder mode: the day (group key) whose slots show up and down buttons
  const [reorderGroupKey, setReorderGroupKey] = useState<string | null>(null);

  // Section menu state (section names are per day, so key by day + section)
  const [sectionMenu, setSectionMenu] = useState<{ groupKey: string; section: string } | null>(null);
  const [sectionMenuButtonEl, setSectionMenuButtonEl] = useState<HTMLElement | null>(null);
  const [sectionMenuStep, setSectionMenuStep] = useState<"rename" | null>(null);
  const [sectionRenameDraft, setSectionRenameDraft] = useState("");

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    body: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  // Items-event state
  const [isItemsEvent, setIsItemsEvent] = useState(false);
  const [itemsList, setItemsList] = useState<ItemInput[]>([emptyItemInput()]);
  const [itemsSaving, setItemsSaving] = useState(false);
  const [itemsError, setItemsError] = useState("");
  const [itemsEventDates, setItemsEventDates] = useState<string[]>([]);
  const [itemsEventStartTime, setItemsEventStartTime] = useState("");
  const [itemsEventEndTime, setItemsEventEndTime] = useState("");
  const [itemsApproximateTime, setItemsApproximateTime] = useState(false);

  useEffect(() => {
    if (!showAddSessionsMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (addSessionsMenuRef.current && !addSessionsMenuRef.current.contains(e.target as Node)) {
        setShowAddSessionsMenu(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAddSessionsMenu(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [showAddSessionsMenu]);

  // Admin page date headers link here with #edit-date-YYYY-MM-DD; once the
  // sessions render, scroll that date into view and briefly highlight it.
  const scrolledToHashRef = useRef(false);
  const [highlightDate, setHighlightDate] = useState<string | null>(null);
  useEffect(() => {
    if (scrolledToHashRef.current || loading || sessions.length === 0) return;
    const hash = window.location.hash.slice(1);
    if (!hash.startsWith("edit-date-")) return;
    const el = document.getElementById(hash);
    if (!el) return;
    scrolledToHashRef.current = true;
    // Defer so the router's own post-navigation scroll doesn't override ours.
    setTimeout(() => el.scrollIntoView({ block: "start" }), 150);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- highlight is driven by window.location.hash + DOM lookup after sessions render
    setHighlightDate(hash.slice("edit-date-".length));
    setTimeout(() => setHighlightDate(null), 2500);
  }, [loading, sessions]);

  const toggleTithingDay = (d: number) => {
    setTithingDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  };

  const toggleRescheduleDay = (d: number) => {
    setRescheduleDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  };

  return {
    brand,
    router,
    params,
    eventId,
    eventName,
    setEventName,
    eventDescription,
    setEventDescription,
    eventTimezone,
    setEventTimezone,
    organizationId,
    setOrganizationId,
    sessions,
    setSessions,
    loading,
    setLoading,
    saving,
    setSaving,
    error,
    setError,
    showToast,
    setShowToast,
    toastMessage,
    setToastMessage,
    savedSnapshot,
    setSavedSnapshot,
    loadedSessionIds,
    setLoadedSessionIds,
    digestEnabled,
    setDigestEnabled,
    instantEnabled,
    setInstantEnabled,
    showSignupsPublicly,
    setShowSignupsPublicly,
    listOnDirectory,
    setListOnDirectory,
    visibilityOpen,
    setVisibilityOpen,
    notificationsOpen,
    setNotificationsOpen,
    settingsOpen,
    setSettingsOpen,
    registrationOpen,
    setRegistrationOpen,
    allowGuests,
    setAllowGuests,
    showCapacityPublicly,
    setShowCapacityPublicly,
    leaderName,
    setLeaderName,
    leaderEmail,
    setLeaderEmail,
    leaderSaveTimer,
    calendarSyncEnabled,
    setCalendarSyncEnabled,
    calendarId,
    setCalendarId,
    calendarName,
    setCalendarName,
    inviteLeader,
    setInviteLeader,
    calendarOpen,
    setCalendarOpen,
    calendarLastSyncedAt,
    setCalendarLastSyncedAt,
    calendarLastError,
    setCalendarLastError,
    sendingReport,
    setSendingReport,
    coverUrl,
    setCoverUrl,
    coverPosition,
    setCoverPosition,
    coverPreview,
    setCoverPreview,
    coverUploading,
    setCoverUploading,
    logoUrl,
    setLogoUrl,
    showReschedule,
    setShowReschedule,
    showRescheduleConfirm,
    setShowRescheduleConfirm,
    signupCount,
    setSignupCount,
    signupsBySession,
    setSignupsBySession,
    lastSavedAt,
    setLastSavedAt,
    settingsStatus,
    setSettingsStatus,
    rescheduleStart,
    setRescheduleStart,
    rescheduleEnd,
    setRescheduleEnd,
    rescheduleTime,
    setRescheduleTime,
    rescheduleEndTime,
    setRescheduleEndTime,
    isTithingReschedule,
    setIsTithingReschedule,
    rescheduleDays,
    setRescheduleDays,
    rescheduleCapacity,
    setRescheduleCapacity,
    rescheduleCapacityDraft,
    setRescheduleCapacityDraft,
    rescheduleLocation,
    setRescheduleLocation,
    rescheduleNotes,
    setRescheduleNotes,
    tithingDays,
    setTithingDays,
    tithingDuration,
    setTithingDuration,
    tithingCapacity,
    setTithingCapacity,
    tithingCapacityDraft,
    setTithingCapacityDraft,
    customDuration,
    setCustomDuration,
    showAddSession,
    setShowAddSession,
    newSessionDate,
    setNewSessionDate,
    newSessionDateObj,
    setNewSessionDateObj,
    newSessionDayOfWeek,
    setNewSessionDayOfWeek,
    newSessionUseDate,
    setNewSessionUseDate,
    newSessionTime,
    setNewSessionTime,
    newSessionEndTime,
    setNewSessionEndTime,
    newSessionCapacity,
    setNewSessionCapacity,
    newSessionLocation,
    setNewSessionLocation,
    newSessionNotes,
    setNewSessionNotes,
    newSessionSection,
    setNewSessionSection,
    newSessionLabel,
    setNewSessionLabel,
    showBulk,
    setShowBulk,
    bulkDays,
    setBulkDays,
    bulkTime,
    setBulkTime,
    bulkEndTime,
    setBulkEndTime,
    bulkCapacity,
    setBulkCapacity,
    bulkCapacityDraft,
    setBulkCapacityDraft,
    bulkLocation,
    setBulkLocation,
    bulkNotes,
    setBulkNotes,
    bulkStartDate,
    setBulkStartDate,
    bulkEndDate,
    setBulkEndDate,
    bulkRangeStart,
    setBulkRangeStart,
    bulkRangeEnd,
    setBulkRangeEnd,
    showDeleteSessionsConfirm,
    setShowDeleteSessionsConfirm,
    deleteSessionsSignupCount,
    setDeleteSessionsSignupCount,
    pendingDeleteSessionIdsRef,
    allowDestructiveDeletesOnceRef,
    editingSessionIndex,
    setEditingSessionIndex,
    draggingIndex,
    setDraggingIndex,
    dragOverIndex,
    setDragOverIndex,
    capacityInputDraft,
    setCapacityInputDraft,
    showAddSessionsMenu,
    setShowAddSessionsMenu,
    addSessionsMenuRef,
    dayMenuGroupKey,
    setDayMenuGroupKey,
    dayMenuButtonEl,
    setDayMenuButtonEl,
    slotMenuIndex,
    setSlotMenuIndex,
    slotMenuButtonEl,
    setSlotMenuButtonEl,
    dayMenuSecondStep,
    setDayMenuSecondStep,
    dayMenuSecondStepDate,
    setDayMenuSecondStepDate,
    reorderGroupKey,
    setReorderGroupKey,
    sectionMenu,
    setSectionMenu,
    sectionMenuButtonEl,
    setSectionMenuButtonEl,
    sectionMenuStep,
    setSectionMenuStep,
    sectionRenameDraft,
    setSectionRenameDraft,
    confirmDialog,
    setConfirmDialog,
    isItemsEvent,
    setIsItemsEvent,
    itemsList,
    setItemsList,
    itemsSaving,
    setItemsSaving,
    itemsError,
    setItemsError,
    itemsEventDates,
    setItemsEventDates,
    itemsEventStartTime,
    setItemsEventStartTime,
    itemsEventEndTime,
    setItemsEventEndTime,
    itemsApproximateTime,
    setItemsApproximateTime,
    scrolledToHashRef,
    highlightDate,
    setHighlightDate,
    toggleTithingDay,
    toggleRescheduleDay,
  };
}

export type EditEventState = ReturnType<typeof useEditEventState>;
