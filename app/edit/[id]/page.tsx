"use client";

import {
  useEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { createClientComponentClient } from "@/lib/auth";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Navigation from "@/components/Navigation";
import Toast from "@/components/Toast";
import { useBrand } from "@/components/BrandProvider";
import { campaignMatchesHostBrand } from "@/lib/campaign-brand-guard";
import OrgLogoButton from "@/components/OrgLogoButton";

const DateRangePicker = dynamic(() => import("@/components/DateRangePicker"), {
  loading: () => (
    <span className="text-sm text-[#5A8399]">Loading date picker…</span>
  ),
  ssr: false,
});
import TimeInput from "@/components/TimeInput";
import {
  generateTithingDeclarationSessions,
  inferTithingDeclarationConfig,
} from "@/lib/tithing-reschedule";
import { organizerReportErrorHint } from "@/lib/organizer-report-ui";
import AdvancedSection from "@/components/create/sections/AdvancedSection";
import ItemsSection from "@/components/create/sections/ItemsSection";
import EventDatesPicker from "@/components/create/EventDatesPicker";
import { groupSessionsForDisplay } from "@/lib/edit-session-classes";
import { isMissingSortOrderError, stripSortOrder } from "@/lib/session-sort-order";
import { INITIAL_FORM_STATE, type CreateFormState, type ItemDraft } from "@/lib/create-form-state";
import { formatTime, formatTimeRange } from "@/lib/utils";

interface SessionData {
  id?: string;
  day_of_week: number;
  time: string;
  end_time?: string;
  capacity: number;
  location: string;
  notes: string;
  session_date?: string;
  /** Optional class-slot label (e.g. "Class 1") — present on per-date class events. */
  label?: string;
  /** Optional class-slot section header (e.g. "Men's Side"). */
  section?: string;
  /** Fallback ordering key for pre-migration data / freshly added slots. */
  created_at?: string;
  /** Explicit organizer-set display order (drag-reorder). */
  sort_order?: number;
}

type ItemInput = ItemDraft;
const emptyItemInput = (): ItemInput => ({ label: "", itemLimit: null });

function mapDbSessionsToState(rows: any[] | null): SessionData[] {
  if (!rows?.length) return [];
  return rows.map((s: any) => ({
    id: s.id,
    day_of_week: s.day_of_week,
    time: s.time,
    end_time: s.end_time || undefined,
    capacity: s.capacity,
    location: s.location || "",
    notes: s.notes || "",
    session_date: s.session_date || undefined,
    label: s.label || undefined,
    section: s.section || undefined,
    created_at: s.created_at || undefined,
    sort_order: typeof s.sort_order === "number" ? s.sort_order : undefined,
  }));
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DURATION_PRESETS = [15, 30, 45, 60];

function countTithingSlotsPerDay(startTime: string, endTime: string, duration: number): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) return 0;
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (duration <= 0) return 0;
  return Math.max(0, Math.floor((endMin - startMin) / duration));
}

function countDaysInRange(rangeStart: Date, rangeEnd: Date, allowedDays: number[]): number {
  const daySet = new Set(allowedDays);
  const cur = new Date(rangeStart);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(rangeEnd);
  end.setHours(0, 0, 0, 0);
  let count = 0;
  while (cur <= end) {
    if (daySet.has(cur.getDay())) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** While typing spots, draft may be "" until blur/apply; minimum stored value is 1. */
function resolveSpotsDraft(draft: string | undefined, committed: number): number {
  if (draft === undefined) return committed;
  const n = parseInt(draft, 10);
  return draft === "" || !Number.isFinite(n) || n < 1 ? 1 : n;
}

/** Select full value on focus; number inputs otherwise clear selection after mouseup. */
function selectAllSpotsOnFocus(e: ReactFocusEvent<HTMLInputElement>) {
  e.currentTarget.select();
}
function keepSpotsSelectionOnMouseUp(e: ReactMouseEvent<HTMLInputElement>) {
  e.preventDefault();
}

function scrollToEditSection(elementId: string) {
  requestAnimationFrame(() => {
    setTimeout(() => {
      document.getElementById(elementId)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
  });
}

export default function EditEventPage() {
  const brand = useBrand();
  const router = useRouter();
  const params = useParams();
  const eventId = params.id as string;

  const [eventName, setEventName] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventTimezone, setEventTimezone] = useState("America/Phoenix");
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [leaderName, setLeaderName] = useState("");
  const [leaderEmail, setLeaderEmail] = useState("");
  // Debounce leader-field auto-save so we don't PATCH on every keystroke.
  const leaderSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sendingReport, setSendingReport] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Reschedule state
  const [showReschedule, setShowReschedule] = useState(false);
  const [showRescheduleConfirm, setShowRescheduleConfirm] = useState(false);
  const [signupCount, setSignupCount] = useState(0);
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
  /** Group key (ISO date) whose date is currently being changed inline. */
  const [editingDateGroupKey, setEditingDateGroupKey] = useState<string | null>(null);
  const [changeDateDraft, setChangeDateDraft] = useState("");
  /** Group key (ISO date) currently being duplicated to a new date. */
  const [duplicatingDayGroupKey, setDuplicatingDayGroupKey] = useState<string | null>(null);
  const [dupDayDraft, setDupDayDraft] = useState("");
  /** Flat-array index of the slot being dragged to reorder, or null. */
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  /** Lets users clear the Spots field while typing; committed on blur / Done. */
  const [capacityInputDraft, setCapacityInputDraft] = useState<Record<number, string>>({});
  const [showAddSessionsMenu, setShowAddSessionsMenu] = useState(false);
  const addSessionsMenuRef = useRef<HTMLDivElement>(null);

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

        // Load org logo (Ministry brand only)
        if (brand.id === "ministrysignup") {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: profile } = await supabase
              .from("organizer_profiles")
              .select("logo_url")
              .eq("user_id", user.id)
              .eq("brand_id", "ministrysignup")
              .maybeSingle();
            setLogoUrl((profile as any)?.logo_url ?? null);
          }
        }

        setLeaderName((event as any).leader_name ?? "");
        setLeaderEmail((event as any).leader_email ?? "");

        // Items events: load items and render the items editor
        if ((event as any).event_type === "items") {
          setEventName((event as any).name || "");
          setEventDescription((event as any).description || "");
          setCoverUrl((event as any).cover_image_url ?? null);
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
        setDigestEnabled(Boolean((event as any).organizer_digest_enabled));
        setInstantEnabled(Boolean((event as any).organizer_instant_notify_enabled));
        setShowSignupsPublicly(Boolean((event as any).show_signups_publicly));
        setCoverUrl((event as any).cover_image_url ?? null);

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
  }, [eventId, brand.id]);

  const patchCampaignFields = async (partial: {
    organizer_digest_enabled?: boolean;
    organizer_instant_notify_enabled?: boolean;
    show_signups_publicly?: boolean;
    event_timezone?: string;
    leader_name?: string | null;
    leader_email?: string | null;
  }) => {
    const supabase = createClientComponentClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify(partial),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to save");
    }
  };

  /** Leader name/email are free-text — auto-save debounced, and only send the
   *  email once it's empty or valid so we don't alert mid-typing. */
  const handleLeaderPatch = (patch: Partial<CreateFormState>) => {
    const hasName = "leaderName" in patch && typeof patch.leaderName === "string";
    const hasEmail = "leaderEmail" in patch && typeof patch.leaderEmail === "string";
    if (!hasName && !hasEmail) return;
    const nextName = hasName ? (patch.leaderName as string) : leaderName;
    const nextEmail = hasEmail ? (patch.leaderEmail as string) : leaderEmail;
    if (hasName) setLeaderName(nextName);
    if (hasEmail) setLeaderEmail(nextEmail);

    const emailTrim = nextEmail.trim();
    if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) return;

    if (leaderSaveTimer.current) clearTimeout(leaderSaveTimer.current);
    leaderSaveTimer.current = setTimeout(() => {
      patchCampaignFields({
        leader_name: nextName.trim() || null,
        leader_email: emailTrim || null,
      }).catch((err: unknown) => {
        alert(err instanceof Error ? err.message : "Could not save");
      });
    }, 800);
  };

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = async () => {
      if (img.width / img.height < 0.9) {
        alert("Please upload a landscape image (wider than tall). A 2:1 ratio is ideal, e.g. 800×400 px.");
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setCoverPreview(objectUrl);
      setCoverUploading(true);
      try {
        const supabase = createClientComponentClient();
        const { data: { session } } = await supabase.auth.getSession();
        const form = new FormData();
        form.append("file", file);
        form.append("type", "cover");
        form.append("eventId", eventId);
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${session?.access_token}` },
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        setCoverUrl(data.url);
        setCoverPreview(null);
        URL.revokeObjectURL(objectUrl);
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Upload failed");
        setCoverPreview(null);
        URL.revokeObjectURL(objectUrl);
      } finally {
        setCoverUploading(false);
      }
    };
    img.src = objectUrl;
    e.target.value = "";
  };

  const handleCoverRemove = async () => {
    if (!confirm("Remove the cover image for this event?")) return;
    setCoverUploading(true);
    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      await fetch("/api/upload", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "cover", eventId }),
      });
      setCoverUrl(null);
      setCoverPreview(null);
    } finally {
      setCoverUploading(false);
    }
  };

  const sendOrganizerReportNow = async () => {
    setSendingReport(true);
    try {
      const supabase = createClientComponentClient();
      let {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        const { data: refreshed, error: refErr } = await supabase.auth.refreshSession();
        if (refErr || !refreshed.session?.access_token) {
          throw new Error("Please sign in again, then try sending the report.");
        }
        session = refreshed.session;
      }
      const res = await fetch(`/api/events/${eventId}/organizer-report`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(organizerReportErrorHint(data.error || "Could not send report"));
      }
      if (data.resendId) {
        console.info("[organizer-report] Resend accepted:", data.resendId);
      }
      const to = typeof data.sentTo === "string" ? data.sentTo : "";
      setToastMessage(
        to ? `Report sent to ${to}. Check inbox and spam.` : "Report sent! Check your inbox.",
      );
      setShowToast(true);
    } catch (e: unknown) {
      alert(
        organizerReportErrorHint(
          e instanceof Error ? e.message : "Could not send report",
        ),
      );
    } finally {
      setSendingReport(false);
    }
  };

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
    setToastMessage(`Rescheduled to ${newSessions.length} session${newSessions.length !== 1 ? 's' : ''}`);
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
          "No sessions would be created — pick weekdays that actually occur between your start and end dates.",
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
    setToastMessage(`Added ${newSessions.length} session${newSessions.length > 1 ? 's' : ''}!`);
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
      setError("Please select a date for this session.");
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

  const removeSession = (index: number) => {
    setSessions(sessions.filter((_, i) => i !== index));
  };

  /** Add another class slot to an existing date, copying that date's time/location
   *  so the organizer only needs to name it. Opens the new row's editor. */
  const addClassToDate = (group: {
    sessionDate: string | null;
    dayOfWeek: number;
    items: { session: SessionData }[];
  }) => {
    const first = group.items[0]?.session;
    const newIndex = sessions.length;
    setSessions([
      ...sessions,
      {
        day_of_week: group.dayOfWeek,
        time: first?.time || "19:00",
        end_time: first?.end_time,
        capacity: first?.capacity ?? 1,
        location: first?.location || "",
        notes: "",
        session_date: group.sessionDate || undefined,
        label: "",
        section: first?.section || "",
      },
    ]);
    setEditingSessionIndex(newIndex);
  };

  /** Move every class on a given date to a new date, preserving each session's
   *  section, label, time, capacity, and notes. day_of_week is recomputed so it
   *  stays consistent with the new calendar date. */
  const changeGroupDate = (oldDate: string, newYmd: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newYmd) || newYmd === oldDate) return;
    const [y, m, d] = newYmd.split("-").map(Number);
    const newDow = new Date(y, m - 1, d).getDay();
    setSessions((prev) =>
      prev.map((s) =>
        (s.session_date ?? "") === oldDate
          ? { ...s, session_date: newYmd, day_of_week: newDow }
          : s,
      ),
    );
  };

  /** Duplicate every class on a date (all sections, labels, times, capacities,
   *  and locations) onto a new date — only the date changes. New copies get no
   *  id so they're inserted as fresh slots on save. */
  const duplicateGroupToDate = (
    group: { items: { session: SessionData }[] },
    newYmd: string,
  ) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newYmd)) return;
    const [y, m, d] = newYmd.split("-").map(Number);
    const newDow = new Date(y, m - 1, d).getDay();
    // Place clones after all existing slots, in the source day's visible order,
    // so the copied day preserves that order (sort_order is renumbered on save).
    const maxSort = sessions.reduce((mx, s) => Math.max(mx, s.sort_order ?? 0), 0);
    const clones: SessionData[] = group.items.map(({ session }, i) => ({
      day_of_week: newDow,
      time: session.time,
      end_time: session.end_time,
      capacity: session.capacity,
      location: session.location,
      notes: session.notes,
      session_date: newYmd,
      label: session.label,
      section: session.section,
      sort_order: maxSort + 1 + i,
    }));
    setSessions((prev) => [...prev, ...clones]);
    setToastMessage(
      `Duplicated ${clones.length} slot${clones.length === 1 ? "" : "s"} to the new date`,
    );
  };

  /** Drag-reorder: move the slot at `fromIndex` to just before the slot at
   *  `toIndex` (same date only), then renumber sort_order across all slots by
   *  the resulting display order so it persists on save. */
  const reorderSlot = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const from = sessions[fromIndex];
    const to = sessions[toIndex];
    if (!from || !to) return;
    if ((from.session_date ?? "") !== (to.session_date ?? "")) return;

    const displayOrder = groupSessionsForDisplay(sessions).flatMap((g) =>
      g.items.map((i) => i.index),
    );
    const fromPos = displayOrder.indexOf(fromIndex);
    if (fromPos < 0) return;
    displayOrder.splice(fromPos, 1);
    let insertAt = displayOrder.indexOf(toIndex);
    if (insertAt < 0) insertAt = displayOrder.length;
    displayOrder.splice(insertAt, 0, fromIndex);

    setSessions((prev) => {
      const next = prev.map((s) => ({ ...s }));
      displayOrder.forEach((flatIdx, pos) => {
        if (next[flatIdx]) next[flatIdx].sort_order = pos;
      });
      return next;
    });
  };

  /** Duplicate every class in a section on a date as a new, distinctly-named
   *  section on that same date — a fast way to mirror a whole side (e.g. build
   *  "Men's Side", duplicate it, rename the copy to "Women's Side"). Copies are
   *  new rows (no id), so they save as inserts and start with no signups. */
  const duplicateSection = (
    group: { sessionDate: string | null; items: { session: SessionData }[] },
    sectionKey: string,
  ) => {
    const inSection = group.items
      .map(({ session }) => session)
      .filter((s) => (s.section ?? "").trim() === sectionKey);
    if (inSection.length === 0) return;

    const taken = new Set(sessions.map((s) => (s.section ?? "").trim()));
    let name = `${sectionKey} copy`;
    let n = 2;
    while (taken.has(name)) name = `${sectionKey} copy ${n++}`;

    const copies: SessionData[] = inSection.map((s) => ({
      day_of_week: s.day_of_week,
      time: s.time,
      end_time: s.end_time,
      capacity: s.capacity,
      location: s.location,
      notes: s.notes,
      session_date: s.session_date,
      label: s.label,
      section: name,
    }));
    setSessions([...sessions, ...copies]);
    setToastMessage(
      `Duplicated “${sectionKey}” as “${name}” (${copies.length} class${copies.length !== 1 ? "es" : ""})`,
    );
    setShowToast(true);
  };

  const updateSession = (index: number, field: keyof SessionData, value: string | number) => {
    const updated = [...sessions];
    updated[index] = { ...updated[index], [field]: value };
    setSessions(updated);
  };

  const commitCapacityDraft = (index: number) => {
    setCapacityInputDraft((d) => {
      const raw = d[index];
      if (raw === undefined) return d;
      const n = parseInt(raw, 10);
      const final = raw === "" || !Number.isFinite(n) || n < 1 ? 1 : n;
      const next = { ...d };
      delete next[index];
      queueMicrotask(() => {
        setSessions((prev) => {
          const updated = [...prev];
          if (updated[index]) {
            updated[index] = { ...updated[index], capacity: final };
          }
          return updated;
        });
      });
      return next;
    });
  };

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
      } else {
        setSignupCount(0);
      }

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
    const filledItems = itemsList.filter((it) => it.label.trim());
    return (
      <>
        <Navigation />
        {/* Sticky save bar */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-[12px] border-t border-[rgba(14,150,176,0.14)] px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-[#0D2B35]">{filledItems.length} item{filledItems.length !== 1 ? "s" : ""}</div>
              <div className="text-xs text-[#5A8399]">Save to update your event</div>
            </div>
            <button onClick={handleSaveItems} disabled={itemsSaving}
              className={`text-sm font-semibold px-5 py-2.5 rounded-xl text-white border-none cursor-pointer shadow-[0_4px_14px_rgba(14,150,176,0.35)] transition-all flex items-center gap-2 ${itemsSaving ? "bg-gradient-to-br from-[#1D9E75] to-[#0F6E56] cursor-default" : "bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] hover:-translate-y-0.5"}`}>
              {itemsSaving ? <><LoadingSpinner size="xs" className="border-white/25 border-t-white" />Saving…</> : <>Save Changes <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></>}
            </button>
          </div>
        </div>
        <main className="min-h-screen bg-[#F4FAFB] p-4 md:p-8 pb-28">
          <div className="max-w-2xl mx-auto">
            <Link href={`/admin/${eventId}`} replace className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0E96B0] hover:text-[#08647E] mb-5 transition-colors no-underline">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              Back to event
            </Link>
            {itemsError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-5 text-sm">{itemsError}</div>}
            {/* Event details */}
            <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden mb-4">
              {/* Cover image banner — Ministry brand only */}
              {brand.id === "ministrysignup" && (
                <div className="relative">
                  <label className="cursor-pointer group block">
                    <div className="w-full aspect-[2/1] relative overflow-hidden bg-[#F4FAFB] flex items-center justify-center">
                      {coverUploading ? (
                        <LoadingSpinner size="lg" />
                      ) : (coverPreview || coverUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={coverPreview ?? coverUrl!} alt="Event cover" className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center text-[#5A8399] px-4">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 mx-auto mb-2 opacity-30">
                            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                          </svg>
                          <p className="text-sm font-medium opacity-50">Add a cover image</p>
                          <p className="text-xs opacity-40 mt-1">2:1 landscape · 800×400 px min · JPEG, PNG, or WebP</p>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm font-semibold bg-black/50 px-3 py-1.5 rounded-lg">
                          {coverUrl || coverPreview ? "Replace cover image" : "Upload cover image"}
                        </span>
                      </div>
                    </div>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={handleCoverChange}
                      disabled={coverUploading || itemsSaving}
                    />
                  </label>
                  {(coverUrl || coverPreview) && !coverUploading && (
                    <button
                      type="button"
                      onClick={handleCoverRemove}
                      className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
                      title="Remove cover image"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                </div>
              )}
              <div className="p-4 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                {brand.id === "ministrysignup" && (
                  <OrgLogoButton initialUrl={logoUrl} size="md" />
                )}
                <h1 className="font-serif text-[28px] text-[#0D2B35]">Edit Event</h1>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">Event Name *</label>
                  <input type="text" value={eventName} onChange={(e) => { setEventName(e.target.value); setItemsError(""); }} placeholder="e.g., Spring Potluck 2026"
                    className="w-full text-base text-[#0D2B35] px-[18px] py-[14px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                    disabled={itemsSaving} required />
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">Description <span className="font-normal text-[#5A8399]">(optional)</span></label>
                  <textarea value={eventDescription} onChange={(e) => setEventDescription(e.target.value)} placeholder="Add details about this event…" rows={3}
                    className="w-full text-base text-[#0D2B35] px-[18px] py-[14px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70 resize-none"
                    disabled={itemsSaving} />
                </div>
                <div>
                  <p className="text-[12px] text-[#5A8399] mb-2">Leave blank if the date is still TBD.</p>
                  <EventDatesPicker
                    dates={itemsEventDates}
                    onChange={(dates) => { setItemsEventDates(dates); setItemsError(""); }}
                  />
                  {itemsEventDates.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setItemsEventDates([])}
                      className="mt-2 text-[12px] font-medium text-[#0E96B0] hover:text-[#08647E] transition-colors"
                      disabled={itemsSaving}
                    >
                      Clear all dates
                    </button>
                  )}
                </div>
                <div>
                  <label className="inline-flex items-center gap-2 cursor-pointer mb-2 select-none">
                    <input type="checkbox" checked={itemsApproximateTime}
                      onChange={(e) => setItemsApproximateTime(e.target.checked)}
                      className="w-4 h-4 rounded border-[rgba(14,150,176,0.4)] text-[#0E96B0] focus:ring-[#0E96B0]"
                      disabled={itemsSaving} />
                    <span className="text-[12px] font-medium text-[#2E5566]">
                      Approximate time <span className="text-[#5A8399] font-normal">(use plain text like &quot;around 9–10am&quot;)</span>
                    </span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">Start Time <span className="font-normal text-[#5A8399]">(optional)</span></label>
                      {itemsApproximateTime ? (
                        <input type="text" value={itemsEventStartTime}
                          onChange={(e) => { setItemsEventStartTime(e.target.value); setItemsError(""); }}
                          placeholder="e.g. around 9am" maxLength={100}
                          className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] rounded-xl bg-white outline-none transition-all border-[1.5px] border-[rgba(14,150,176,0.22)] focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                          disabled={itemsSaving} />
                      ) : (
                        <TimeInput value={itemsEventStartTime}
                          onChange={(v) => { setItemsEventStartTime(v); setItemsError(""); }}
                          disabled={itemsSaving}
                          className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] rounded-xl bg-white outline-none transition-all border-[1.5px] border-[rgba(14,150,176,0.22)] focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">End Time <span className="font-normal text-[#5A8399]">(optional)</span></label>
                      {itemsApproximateTime ? (
                        <input type="text" value={itemsEventEndTime}
                          onChange={(e) => { setItemsEventEndTime(e.target.value); setItemsError(""); }}
                          placeholder="e.g. by lunchtime" maxLength={100}
                          className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] rounded-xl bg-white outline-none transition-all border-[1.5px] border-[rgba(14,150,176,0.22)] focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                          disabled={itemsSaving} />
                      ) : (
                        <TimeInput value={itemsEventEndTime}
                          onChange={(v) => { setItemsEventEndTime(v); setItemsError(""); }}
                          placeholder="e.g. 5pm"
                          disabled={itemsSaving}
                          className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] rounded-xl bg-white outline-none transition-all border-[1.5px] border-[rgba(14,150,176,0.22)] focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Items */}
            <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-4 md:p-8">
              <h2 className="font-serif text-[22px] text-[#0D2B35] mb-2">Items</h2>
              <p className="text-[15px] text-[#5A8399] mb-7">List the things people can claim — a dish to bring, a job to do, anything goes. Each item is Unlimited by default; switch to a numeric cap to limit signups.</p>
              <ItemsSection
                state={{
                  ...INITIAL_FORM_STATE,
                  eventType: "items",
                  items: itemsList,
                }}
                set={(patch) => {
                  if (patch.items) {
                    setItemsList(patch.items);
                    setItemsError("");
                  }
                }}
              />
              <div className="mt-4 mb-6" />
              <div className="bg-[#E6F7FB] border border-[rgba(14,150,176,0.18)] rounded-xl px-[18px] py-[14px] text-sm leading-relaxed text-[#2E5566] mb-6">
                <strong className="text-[#0D2B35] font-semibold">Tip:</strong>{" "}Press <kbd className="bg-white border border-[rgba(14,150,176,0.22)] rounded px-1 py-0.5 text-xs font-mono">Enter</kbd> in any item field to quickly add the next row.
              </div>
              <AdvancedSection
                state={{
                  ...INITIAL_FORM_STATE,
                  showSignupsPublicly,
                  organizerDigestEnabled: digestEnabled,
                  organizerInstantNotifyEnabled: instantEnabled,
                  eventTimezone,
                  leaderName,
                  leaderEmail,
                  expanded: { ...INITIAL_FORM_STATE.expanded, advanced: advancedOpen },
                }}
                set={(patch: Partial<CreateFormState>) => {
                  if ("expanded" in patch && patch.expanded) {
                    setAdvancedOpen(patch.expanded.advanced);
                  }
                  if ("showSignupsPublicly" in patch && typeof patch.showSignupsPublicly === "boolean") {
                    const next = patch.showSignupsPublicly;
                    setShowSignupsPublicly(next);
                    patchCampaignFields({ show_signups_publicly: next }).catch((err: unknown) => {
                      setShowSignupsPublicly(!next);
                      alert(err instanceof Error ? err.message : "Could not save");
                    });
                  }
                  if (
                    "organizerDigestEnabled" in patch &&
                    typeof patch.organizerDigestEnabled === "boolean"
                  ) {
                    const next = patch.organizerDigestEnabled;
                    setDigestEnabled(next);
                    patchCampaignFields({ organizer_digest_enabled: next }).catch((err: unknown) => {
                      setDigestEnabled(!next);
                      alert(err instanceof Error ? err.message : "Could not save");
                    });
                  }
                  if (
                    "organizerInstantNotifyEnabled" in patch &&
                    typeof patch.organizerInstantNotifyEnabled === "boolean"
                  ) {
                    const next = patch.organizerInstantNotifyEnabled;
                    setInstantEnabled(next);
                    patchCampaignFields({ organizer_instant_notify_enabled: next }).catch((err: unknown) => {
                      setInstantEnabled(!next);
                      alert(err instanceof Error ? err.message : "Could not save");
                    });
                  }
                  if ("eventTimezone" in patch && typeof patch.eventTimezone === "string") {
                    const next = patch.eventTimezone;
                    const prev = eventTimezone;
                    setEventTimezone(next);
                    patchCampaignFields({ event_timezone: next }).catch((err: unknown) => {
                      setEventTimezone(prev);
                      alert(err instanceof Error ? err.message : "Could not save");
                    });
                  }
                  handleLeaderPatch(patch);
                }}
              />
            </div>
            </div>{/* end p-4 md:p-8 */}
          </div>
        </main>
      </>
    );
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
            {/* Cover image banner — Ministry brand only */}
            {brand.id === "ministrysignup" && (
              <div className="relative">
                <label className="cursor-pointer group block">
                  <div className="w-full aspect-[2/1] relative overflow-hidden bg-[#F4FAFB] flex items-center justify-center">
                    {coverUploading ? (
                      <LoadingSpinner size="lg" />
                    ) : (coverPreview || coverUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={coverPreview ?? coverUrl!} alt="Event cover" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center text-[#5A8399] px-4">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 mx-auto mb-2 opacity-30">
                          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21 15 16 10 5 21"/>
                        </svg>
                        <p className="text-sm font-medium opacity-50">Add a cover image</p>
                        <p className="text-xs opacity-40 mt-1">2:1 landscape · 800×400 px min · JPEG, PNG, or WebP</p>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm font-semibold bg-black/50 px-3 py-1.5 rounded-lg">
                        {coverUrl || coverPreview ? "Replace cover image" : "Upload cover image"}
                      </span>
                    </div>
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={handleCoverChange}
                    disabled={coverUploading}
                  />
                </label>
                {(coverUrl || coverPreview) && !coverUploading && (
                  <button
                    type="button"
                    onClick={handleCoverRemove}
                    className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
                    title="Remove cover image"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            )}
            <div className="p-4 md:p-8">
            <div className="flex items-center gap-3 mb-4">
              {brand.id === "ministrysignup" && (
                <OrgLogoButton initialUrl={logoUrl} size="md" />
              )}
              <h1 className="font-serif text-[28px] text-[#0D2B35]">Edit Event</h1>
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

              <AdvancedSection
                state={{
                  ...INITIAL_FORM_STATE,
                  showSignupsPublicly,
                  organizerDigestEnabled: digestEnabled,
                  organizerInstantNotifyEnabled: instantEnabled,
                  eventTimezone,
                  leaderName,
                  leaderEmail,
                  expanded: { ...INITIAL_FORM_STATE.expanded, advanced: advancedOpen },
                }}
                set={(patch: Partial<CreateFormState>) => {
                  // Each toggle / select auto-saves to the campaign on change.
                  if ("expanded" in patch && patch.expanded) {
                    setAdvancedOpen(patch.expanded.advanced);
                  }
                  if ("showSignupsPublicly" in patch && typeof patch.showSignupsPublicly === "boolean") {
                    const next = patch.showSignupsPublicly;
                    setShowSignupsPublicly(next);
                    patchCampaignFields({ show_signups_publicly: next }).catch((err: unknown) => {
                      setShowSignupsPublicly(!next);
                      alert(err instanceof Error ? err.message : "Could not save");
                    });
                  }
                  if (
                    "organizerDigestEnabled" in patch &&
                    typeof patch.organizerDigestEnabled === "boolean"
                  ) {
                    const next = patch.organizerDigestEnabled;
                    setDigestEnabled(next);
                    patchCampaignFields({ organizer_digest_enabled: next }).catch((err: unknown) => {
                      setDigestEnabled(!next);
                      alert(err instanceof Error ? err.message : "Could not save");
                    });
                  }
                  if (
                    "organizerInstantNotifyEnabled" in patch &&
                    typeof patch.organizerInstantNotifyEnabled === "boolean"
                  ) {
                    const next = patch.organizerInstantNotifyEnabled;
                    setInstantEnabled(next);
                    patchCampaignFields({ organizer_instant_notify_enabled: next }).catch((err: unknown) => {
                      setInstantEnabled(!next);
                      alert(err instanceof Error ? err.message : "Could not save");
                    });
                  }
                  if ("eventTimezone" in patch && typeof patch.eventTimezone === "string") {
                    const next = patch.eventTimezone;
                    const prev = eventTimezone;
                    setEventTimezone(next);
                    patchCampaignFields({ event_timezone: next }).catch((err: unknown) => {
                      setEventTimezone(prev);
                      alert(err instanceof Error ? err.message : "Could not save");
                    });
                  }
                  handleLeaderPatch(patch);
                }}
              />
              <button
                type="button"
                disabled={sendingReport}
                onClick={sendOrganizerReportNow}
                className="text-xs font-semibold text-[#0E96B0] hover:text-[#08647E] disabled:opacity-50 disabled:cursor-not-allowed underline-offset-2 hover:underline"
              >
                {sendingReport ? "Sending…" : "Send organizer report now"}
              </button>

              {/* Sessions */}
              <div id="sessions-section" className="border-t border-[rgba(14,150,176,0.12)] pt-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#0D2B35]">Slots</div>
                    <div className="text-xs text-[#5A8399]">Add, edit, or replace sessions for this event</div>
                  </div>

                  <div className="w-full sm:w-auto flex flex-col sm:flex-row sm:items-center gap-2 sm:flex-shrink-0">
                    <div className="relative w-full sm:w-auto" ref={addSessionsMenuRef}>
                      <button
                        type="button"
                        onClick={() => setShowAddSessionsMenu((v) => !v)}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.30)] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(14,150,176,0.40)] transition-all"
                      >
                        Add sessions
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 transition-transform ${showAddSessionsMenu ? "rotate-180" : ""}`}>
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </button>

                      {showAddSessionsMenu && (
                        <div className="absolute left-0 right-0 sm:left-auto sm:right-0 mt-2 w-full sm:w-64 bg-white rounded-xl shadow-[0_10px_32px_rgba(8,100,126,0.18)] border border-[#0E96B0]/10 py-1 z-30">
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddSessionsMenu(false);
                              setShowBulk(false);
                              setShowAddSession(true);
                              setTimeout(() => {
                                const el = document.getElementById("add-one-session");
                                if (el) {
                                  const top = el.getBoundingClientRect().top + window.scrollY - 16;
                                  window.scrollTo({ top, behavior: "smooth" });
                                }
                              }, 50);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-[#2E5566] hover:bg-[#E6F7FB] hover:text-[#0D2B35] transition-colors"
                          >
                            Add one session
                            <div className="text-[11px] text-[#5A8399] mt-0.5">Pick a single date or day-of-week</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddSessionsMenu(false);
                              setShowAddSession(false);
                              setShowBulk(true);
                              setTimeout(() => {
                                const el = document.getElementById("add-multiple-sessions");
                                if (el) {
                                  const top = el.getBoundingClientRect().top + window.scrollY - 16;
                                  window.scrollTo({ top, behavior: "smooth" });
                                }
                              }, 50);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-[#2E5566] hover:bg-[#E6F7FB] hover:text-[#0D2B35] transition-colors"
                          >
                            Add multiple sessions
                            <div className="text-[11px] text-[#5A8399] mt-0.5">Same time &amp; details across several days</div>
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const next = !showReschedule;
                        setShowReschedule(next);
                        if (next) {
                          setShowBulk(false);
                          setShowAddSession(false);
                          setTimeout(() => {
                            const el = document.getElementById("replace-schedule");
                            if (el) {
                              const top = el.getBoundingClientRect().top + window.scrollY - 16;
                              window.scrollTo({ top, behavior: "smooth" });
                            }
                          }, 50);
                        }
                      }}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border-[1.5px] border-amber-300/70 text-amber-800 bg-amber-50 hover:bg-amber-100 transition-colors"
                    >
                      Replace all sessions
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 transition-transform ${showReschedule ? "rotate-180" : ""}`}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Reschedule All Sessions */}
              <div id="reschedule-section" className="hidden">
                <button type="button" onClick={() => setShowReschedule(!showReschedule)}>Toggle</button>
              </div>

                {showReschedule && (
                  <div id="replace-schedule" className="border border-amber-200 rounded-xl p-5 space-y-5 bg-white overflow-x-hidden">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[#0D2B35]">Replace all sessions</div>
                        <div className="text-xs text-[#5A8399]">Regenerate sessions using the settings below</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowReschedule(false)}
                        className="text-xs font-semibold text-[#08647E] hover:text-[#0E96B0] transition-colors"
                      >
                        Close
                      </button>
                    </div>
                    <div>
                      <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
                        {isTithingReschedule ? "Schedule Dates" : "New Date Range"}
                      </label>
                      <DateRangePicker
                        rangeStart={rescheduleStart}
                        rangeEnd={rescheduleEnd}
                        onChange={(s, e) => { setRescheduleStart(s); setRescheduleEnd(e); }}
                        initialMonth={rescheduleStart ?? undefined}
                      />
                    </div>

                    <div>
                      <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
                        Days of Week
                      </label>
                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 min-w-0">
                        {DAYS_SHORT.map((d, i) => {
                          const selected = isTithingReschedule ? tithingDays.includes(i) : rescheduleDays.includes(i);
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => (isTithingReschedule ? toggleTithingDay(i) : toggleRescheduleDay(i))}
                              className={`w-full min-w-0 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                                selected
                                  ? "bg-gradient-to-br from-[#0E96B0] to-[#08647E] text-white"
                                  : "bg-[#F4FAFB] border-[1.5px] border-[rgba(14,150,176,0.22)] text-[#2E5566] hover:border-[#0E96B0] hover:bg-[#E6F7FB]"
                              }`}
                            >
                              {d}
                            </button>
                          );
                        })}
                      </div>
                      {!isTithingReschedule && (
                        <p className="text-[12px] text-[#5A8399] mt-2">
                          Sessions will be created only on these days within the date range.
                        </p>
                      )}
                    </div>

                    <div className={isTithingReschedule ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : "grid grid-cols-1 sm:grid-cols-2 gap-4"}>
                      <div>
                        <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
                          {isTithingReschedule ? "Start Time" : "Start Time"}
                        </label>
                        <TimeInput
                          value={rescheduleTime}
                          onChange={setRescheduleTime}
                          className={
                            isTithingReschedule
                              ? "w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                              : "w-full text-base text-[#0D2B35] px-[14px] py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
                          {isTithingReschedule ? "End Time" : "End Time (Optional)"}
                        </label>
                        <TimeInput
                          value={rescheduleEndTime}
                          onChange={setRescheduleEndTime}
                          placeholder="e.g. 9pm"
                          className={
                            isTithingReschedule
                              ? "w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                              : "w-full text-base text-[#0D2B35] px-[14px] py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                          }
                        />
                      </div>
                    </div>

                    {isTithingReschedule ? (
                      <div className="space-y-5">
                        {/* Session duration (match create) */}
                        <div>
                          <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
                            Session Duration
                          </label>
                          <div className="flex gap-2 flex-wrap">
                            {DURATION_PRESETS.map((mins) => (
                              <button
                                key={mins}
                                type="button"
                                onClick={() => {
                                  setTithingDuration(mins);
                                  setCustomDuration("");
                                }}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                  tithingDuration === mins && customDuration === ""
                                    ? "bg-gradient-to-br from-[#0E96B0] to-[#08647E] text-white"
                                    : "bg-[#F4FAFB] border-[1.5px] border-[rgba(14,150,176,0.22)] text-[#2E5566] hover:border-[#0E96B0] hover:bg-[#E6F7FB]"
                                }`}
                              >
                                {mins} min
                              </button>
                            ))}
                            <div className="relative flex items-center">
                              <input
                                type="number"
                                min="1"
                                max="240"
                                placeholder="Custom"
                                value={customDuration}
                                onChange={(e) => {
                                  setCustomDuration(e.target.value);
                                  const v = parseInt(e.target.value);
                                  if (!isNaN(v) && v > 0) setTithingDuration(v);
                                }}
                                className={`w-24 text-sm text-[#0D2B35] px-3 py-2 border-[1.5px] rounded-lg outline-none transition-all placeholder:text-[#5A8399] placeholder:opacity-70 ${
                                  customDuration !== ""
                                    ? "border-[#0E96B0] bg-[#E6F7FB] shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                                    : "border-[rgba(14,150,176,0.22)] bg-[#F4FAFB] focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                                }`}
                              />
                              {customDuration !== "" && (
                                <span className="absolute right-3 text-[11px] text-[#5A8399]">min</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Spots per slot (match create) */}
                        <div>
                          <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">
                            Spots available
                          </label>
                          <p className="text-[12px] text-[#5A8399] mb-2">
                            How many people or families can sign up for this session?
                          </p>
                          <input
                            type="number"
                            min="1"
                            value={
                              tithingCapacityDraft !== undefined
                                ? tithingCapacityDraft
                                : String(tithingCapacity)
                            }
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === "" || /^\d+$/.test(raw)) {
                                setTithingCapacityDraft(raw);
                                if (raw !== "") {
                                  const n = parseInt(raw, 10);
                                  if (n >= 1) setTithingCapacity(n);
                                }
                              }
                            }}
                            onBlur={() => {
                              setTithingCapacityDraft((draft) => {
                                if (draft === undefined) return undefined;
                                const final = resolveSpotsDraft(draft, tithingCapacity);
                                queueMicrotask(() => setTithingCapacity(final));
                                return undefined;
                              });
                            }}
                            onFocus={selectAllSpotsOnFocus}
                            onMouseUp={keepSpotsSelectionOnMouseUp}
                            className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">
                            Spots available
                          </label>
                          <p className="text-[12px] text-[#5A8399] mb-2">
                            How many people or families can sign up for this session?
                          </p>
                          <input
                            type="number"
                            min="1"
                            value={
                              rescheduleCapacityDraft !== undefined
                                ? rescheduleCapacityDraft
                                : String(rescheduleCapacity)
                            }
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === "" || /^\d+$/.test(raw)) {
                                setRescheduleCapacityDraft(raw);
                                if (raw !== "") {
                                  const n = parseInt(raw, 10);
                                  if (n >= 1) setRescheduleCapacity(n);
                                }
                              }
                            }}
                            onBlur={() => {
                              setRescheduleCapacityDraft((draft) => {
                                if (draft === undefined) return undefined;
                                const final = resolveSpotsDraft(draft, rescheduleCapacity);
                                queueMicrotask(() => setRescheduleCapacity(final));
                                return undefined;
                              });
                            }}
                            onFocus={selectAllSpotsOnFocus}
                            onMouseUp={keepSpotsSelectionOnMouseUp}
                            className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                          />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
                          Location
                        </label>
                        <input
                          type="text"
                          value={rescheduleLocation}
                          onChange={(e) => setRescheduleLocation(e.target.value)}
                          placeholder="e.g., Meetinghouse"
                          className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
                          Notes <span className="font-normal text-[#5A8399]">(optional)</span>
                        </label>
                        <input
                          type="text"
                          value={rescheduleNotes}
                          onChange={(e) => setRescheduleNotes(e.target.value)}
                          placeholder="Optional"
                          className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                        />
                      </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                      {isTithingReschedule
                        ? "This will replace all existing sessions with appointment slots across the new range."
                        : `This will replace all ${sessions.length} existing session${sessions.length !== 1 ? "s" : ""} with new sessions based on the settings above.`}
                    </div>

                    <div className="bg-[#E6F7FB] border border-[rgba(14,150,176,0.18)] rounded-xl px-[18px] py-[14px] text-sm leading-relaxed text-[#2E5566]">
                      <strong className="text-[#0D2B35] font-semibold">Ready to go:</strong>{" "}
                      {rescheduleStart && rescheduleEnd
                        ? (() => {
                            if (isTithingReschedule) {
                              if (tithingDays.length === 0) return "Choose days of week to generate slots.";
                              const dayCount = countDaysInRange(rescheduleStart, rescheduleEnd, tithingDays);
                              const perDay = countTithingSlotsPerDay(rescheduleTime, rescheduleEndTime, tithingDuration);
                              const total = dayCount * perDay;
                              return total > 0
                                ? `${total} slot${total !== 1 ? "s" : ""} will be created — ${tithingDuration}-min appointments, ${formatTimeRange(rescheduleTime, rescheduleEndTime)}.`
                                : "Configure the schedule above to auto-generate slots.";
                            }

                            if (rescheduleDays.length === 0) return "Choose days of week to generate sessions.";
                            const dayCount = countDaysInRange(rescheduleStart, rescheduleEnd, rescheduleDays);
                            return dayCount > 0
                              ? `${dayCount} session${dayCount !== 1 ? "s" : ""} will be created — ${formatTimeRange(rescheduleTime, rescheduleEndTime)}.`
                              : "Choose a date range and days of week to generate sessions.";
                          })()
                        : "Choose a date range to see a preview."}
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setShowReschedule(false)}
                        className="flex-1 text-sm font-semibold px-4 py-[10px] rounded-xl border-[1.5px] border-[#0E96B0]/40 text-[#08647E] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={applyReschedule}
                        disabled={
                          !rescheduleStart ||
                          !rescheduleEnd ||
                          (isTithingReschedule ? tithingDays.length === 0 : rescheduleDays.length === 0)
                        }
                        className={`flex-1 text-sm font-semibold px-4 py-[10px] rounded-xl text-white transition-all ${
                          rescheduleStart &&
                          rescheduleEnd &&
                          (!isTithingReschedule || tithingDays.length > 0)
                            ? "bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] shadow-[0_4px_14px_rgba(14,150,176,0.30)] hover:-translate-y-0.5"
                            : "bg-[#C8DDE6] cursor-default"
                        }`}
                      >
                        {rescheduleStart && rescheduleEnd
                          ? (() => {
                              if (!isTithingReschedule) {
                                const dayCount = countDaysInRange(rescheduleStart, rescheduleEnd, rescheduleDays);
                                return `Apply — ${dayCount} session${dayCount === 1 ? "" : "s"}`;
                              }
                              const dayCount = countDaysInRange(rescheduleStart, rescheduleEnd, tithingDays);
                              const perDay = countTithingSlotsPerDay(rescheduleTime, rescheduleEndTime, tithingDuration);
                              const total = dayCount * perDay;
                              return `Apply — ${total} slot${total === 1 ? "" : "s"}`;
                            })()
                          : "Select a date range"}
                      </button>
                    </div>
                  </div>
                )}

              {/* Add sessions tools (opened via "Add sessions") */}
              <>
                <div className="hidden">
                  <button type="button" onClick={() => setShowBulk(!showBulk)}>Toggle</button>
                </div>

                {showBulk && (
                  <div id="add-multiple-sessions" className="bg-[#E6F7FB] border border-[rgba(14,150,176,0.18)] rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[#0D2B35]">Add multiple sessions</div>
                        <div className="text-xs text-[#5A8399]">Same time &amp; details across several days</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowBulk(false)}
                        className="text-xs font-semibold text-[#08647E] hover:text-[#0E96B0] transition-colors"
                      >
                        Close
                      </button>
                    </div>

                    <p className="text-[12px] text-[#2E5566] leading-relaxed border-b border-[rgba(14,150,176,0.12)] pb-3">
                      <span className="font-semibold text-[#0D2B35]">How this works:</span> Choose a{" "}
                      <strong>date range</strong> first (optional). Then choose which{" "}
                      <strong>weekdays</strong> count. We only create sessions on those weekdays that fall
                      inside the range. Leave the calendar empty for <strong>recurring every week</strong>{" "}
                      (no specific dates).
                    </p>

                    <div id="edit-bulk-calendar">
                      <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">
                        Date range <span className="font-normal text-[#5A8399]">(optional)</span>
                      </label>
                      <p className="text-[12px] text-[#5A8399] mb-2">
                        Tap start, then end — tap the same day twice for a single day. Skip this step for
                        weekly recurring slots.
                      </p>
                      <div className="p-2 -m-1 rounded-xl">
                        <DateRangePicker
                          rangeStart={bulkRangeStart}
                          rangeEnd={bulkRangeEnd}
                          onChange={(s, e) => {
                            setBulkRangeStart(s);
                            setBulkRangeEnd(e);
                            const fmt = (d: Date) =>
                              `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                            setBulkStartDate(s ? fmt(s) : "");
                            setBulkEndDate(e ? fmt(e) : "");
                          }}
                        />
                      </div>
                    </div>

                    <div id="edit-bulk-days">
                      <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
                        Which weekdays? *
                      </label>
                      <p className="text-[12px] text-[#5A8399] mb-2">
                        With a date range: only those calendar dates that match these weekdays. Without a
                        range: one recurring slot per selected weekday.
                      </p>
                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                        {DAYS.map((day, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => toggleBulkDay(index)}
                            className={`px-2 py-2 rounded-xl text-sm font-medium transition-colors touch-manipulation ${
                              bulkDays.includes(index)
                                ? "bg-gradient-to-br from-[#0E96B0] to-[#08647E] text-white"
                                : "bg-white border-[1.5px] border-[rgba(14,150,176,0.22)] text-[#2E5566] hover:border-[#0E96B0] hover:bg-[#E6F7FB]"
                            }`}
                          >
                            {day.slice(0, 3)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Time and spots */}
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="min-w-0">
                          <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
                            Start Time *
                          </label>
                          <TimeInput
                            value={bulkTime}
                            onChange={setBulkTime}
                            className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
                            End Time
                          </label>
                          <TimeInput
                            value={bulkEndTime}
                            onChange={setBulkEndTime}
                            placeholder="e.g. 5pm"
                            className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                          />
                        </div>
                      </div>

                      <div className="min-w-0">
                        <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">
                          Spots available *
                        </label>
                        <p className="text-[12px] text-[#5A8399] mb-2">
                          How many people or families can sign up for this session?
                        </p>
                        <input
                          type="number"
                          min="1"
                          value={
                            bulkCapacityDraft !== undefined
                              ? bulkCapacityDraft
                              : String(bulkCapacity)
                          }
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "" || /^\d+$/.test(raw)) {
                              setBulkCapacityDraft(raw);
                              if (raw !== "") {
                                const n = parseInt(raw, 10);
                                if (Number.isFinite(n) && n >= 1) {
                                  setBulkCapacity(n);
                                }
                              }
                            }
                          }}
                          onBlur={() => {
                            setBulkCapacityDraft((draft) => {
                              if (draft === undefined) return undefined;
                              const final = resolveSpotsDraft(draft, bulkCapacity);
                              queueMicrotask(() => setBulkCapacity(final));
                              return undefined;
                            });
                          }}
                          onFocus={selectAllSpotsOnFocus}
                          onMouseUp={keepSpotsSelectionOnMouseUp}
                          className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                        />
                      </div>
                    </div>

                    {/* Location */}
                    <div>
                      <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
                        Location
                      </label>
                      <input
                        type="text"
                        value={bulkLocation}
                        onChange={(e) => setBulkLocation(e.target.value)}
                        placeholder="e.g., Meetinghouse"
                        className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                      />
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
                        Notes (Optional)
                      </label>
                      <textarea
                        value={bulkNotes}
                        onChange={(e) => setBulkNotes(e.target.value)}
                        placeholder="Additional details..."
                        rows={2}
                        className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={addBulkSessions}
                      className="w-full text-base font-semibold px-4 py-[13px] rounded-xl text-white bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] shadow-[0_4px_14px_rgba(14,150,176,0.30)] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(14,150,176,0.40)] transition-all touch-manipulation"
                    >
                      {(() => {
                        const count = calculateSessionCount();
                        return count > 0 ? `Add ${count} Session${count > 1 ? 's' : ''}` : 'Add Sessions';
                      })()}
                    </button>
                  </div>
                )}

                {/* Add one session (opened via "Add sessions") */}
                <div className="hidden">
                  <button type="button" onClick={() => setShowAddSession(!showAddSession)}>Toggle</button>
                </div>

                  {showAddSession && (
                    <div id="add-one-session" className="mt-3 bg-[#E6F7FB] border border-[rgba(14,150,176,0.18)] rounded-xl p-5 space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[#0D2B35]">Add one session</div>
                          <div className="text-xs text-[#5A8399]">Pick a single date or day-of-week</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAddSession(false)}
                          className="text-xs font-semibold text-[#08647E] hover:text-[#0E96B0] transition-colors"
                        >
                          Close
                        </button>
                      </div>
                      {/* Date type toggle */}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setNewSessionUseDate(true)}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors touch-manipulation ${newSessionUseDate ? "bg-gradient-to-br from-[#0E96B0] to-[#08647E] text-white" : "bg-white border-[1.5px] border-[rgba(14,150,176,0.22)] text-[#2E5566] hover:border-[#0E96B0]"}`}>
                          Specific Date
                        </button>
                        <button type="button" onClick={() => setNewSessionUseDate(false)}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors touch-manipulation ${!newSessionUseDate ? "bg-gradient-to-br from-[#0E96B0] to-[#08647E] text-white" : "bg-white border-[1.5px] border-[rgba(14,150,176,0.22)] text-[#2E5566] hover:border-[#0E96B0]"}`}>
                          Day of Week
                        </button>
                      </div>

                      {newSessionUseDate ? (
                        <div id="edit-individual-date" className="p-2 -m-1 rounded-xl">
                          <DateRangePicker
                            singleDate
                            rangeStart={newSessionDateObj}
                            rangeEnd={null}
                            onChange={(s) => {
                              setNewSessionDateObj(s);
                              if (s) {
                                const y = s.getFullYear();
                                const m = String(s.getMonth() + 1).padStart(2, '0');
                                const d = String(s.getDate()).padStart(2, '0');
                                setNewSessionDate(`${y}-${m}-${d}`);
                              } else {
                                setNewSessionDate("");
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <div id="edit-individual-date">
                          <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">
                            Day of week *
                          </label>
                          <p className="text-[12px] text-[#5A8399] mb-2">
                            Recurring weekly — not tied to one calendar date. People pick “Fridays” (for
                            example) until you remove the slot.
                          </p>
                          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                            {DAYS.map((day, i) => (
                              <button key={i} type="button" onClick={() => setNewSessionDayOfWeek(i)}
                                className={`px-2 py-2 rounded-xl text-sm font-medium transition-colors touch-manipulation ${newSessionDayOfWeek === i ? "bg-gradient-to-br from-[#0E96B0] to-[#08647E] text-white" : "bg-white border-[1.5px] border-[rgba(14,150,176,0.22)] text-[#2E5566] hover:border-[#0E96B0] hover:bg-[#E6F7FB]"}`}>
                                {day.slice(0, 3)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="min-w-0">
                          <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
                            Section <span className="font-normal text-[#5A8399]">(optional)</span>
                          </label>
                          <input type="text" list="edit-session-sections" value={newSessionSection}
                            onChange={(e) => setNewSessionSection(e.target.value)}
                            placeholder="e.g. Women's Side"
                            className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                          />
                          <p className="text-[12px] text-[#5A8399] mt-1">Groups classes under a header (e.g. Women&apos;s Side).</p>
                        </div>
                        <div className="min-w-0">
                          <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
                            Class name <span className="font-normal text-[#5A8399]">(optional)</span>
                          </label>
                          <input type="text" value={newSessionLabel}
                            onChange={(e) => setNewSessionLabel(e.target.value)}
                            placeholder="e.g. Women's Class"
                            className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                          />
                          <p className="text-[12px] text-[#5A8399] mt-1">Names this specific claimable slot.</p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="min-w-0">
                            <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">Start Time *</label>
                            <TimeInput value={newSessionTime} onChange={setNewSessionTime}
                              className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                            />
                          </div>
                          <div className="min-w-0">
                            <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">End Time</label>
                            <TimeInput value={newSessionEndTime} onChange={setNewSessionEndTime} placeholder="e.g. 5pm"
                              className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                            />
                          </div>
                        </div>

                        <div className="min-w-0">
                          <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">Spots available *</label>
                          <p className="text-[12px] text-[#5A8399] mb-2">
                            How many people or families can sign up for this session?
                          </p>
                          <input type="number" min="1" value={newSessionCapacity} onChange={(e) => setNewSessionCapacity(parseInt(e.target.value))}
                            onFocus={selectAllSpotsOnFocus}
                            onMouseUp={keepSpotsSelectionOnMouseUp}
                            className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">Location</label>
                        <input type="text" value={newSessionLocation} onChange={(e) => setNewSessionLocation(e.target.value)}
                          placeholder="e.g., Meetinghouse"
                          className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                        />
                      </div>

                      <div>
                        <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">Notes (Optional)</label>
                        <textarea value={newSessionNotes} onChange={(e) => setNewSessionNotes(e.target.value)}
                          placeholder="Additional details..." rows={2}
                          className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                        />
                      </div>

                      <button type="button" onClick={addSession}
                        className="w-full text-base font-semibold px-4 py-[13px] rounded-xl text-white bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] shadow-[0_4px_14px_rgba(14,150,176,0.30)] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(14,150,176,0.40)] transition-all touch-manipulation">
                        Add Session
                      </button>
                    </div>
                  )}

                {sessions.length === 0 ? (
                  <div
                    id="edit-sessions-empty"
                    className="bg-[#F4FAFB] rounded-xl p-6 text-center text-sm text-[#5A8399]"
                  >
                    No sessions yet. Use <span className="font-medium text-[#2E5566]">Add sessions</span>{" "}
                    above — <span className="font-medium text-[#2E5566]">Add multiple sessions</span> or{" "}
                    <span className="font-medium text-[#2E5566]">Add one session</span>.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {groupSessionsForDisplay(sessions).map((group) => (
                      <div key={group.key} className="space-y-2">
                        {/* Date header — mirrors the public preview's per-date grouping */}
                        <div className="flex items-center gap-2 px-0.5">
                          <div className="font-serif text-[17px] text-[#0D2B35]">
                            {group.sessionDate
                              ? (() => {
                                  const [year, month, day] = group.sessionDate.split("-").map(Number);
                                  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
                                    weekday: "long",
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  });
                                })()
                              : DAYS[group.dayOfWeek]}
                          </div>
                          {group.sessionDate && (
                            editingDateGroupKey === group.key ? (
                              <span className="inline-flex items-center gap-1.5">
                                <input
                                  type="date"
                                  autoFocus
                                  value={changeDateDraft}
                                  onChange={(e) => setChangeDateDraft(e.target.value)}
                                  className="text-sm text-[#0D2B35] px-2 py-1 border-[1.5px] border-[#0E96B0] rounded-lg bg-white outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (changeDateDraft) changeGroupDate(group.sessionDate!, changeDateDraft);
                                    setEditingDateGroupKey(null);
                                  }}
                                  className="text-[11px] font-semibold text-white bg-[#0E96B0] hover:bg-[#08647E] px-2.5 py-1.5 rounded-lg transition-colors"
                                >
                                  Move
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingDateGroupKey(null)}
                                  className="text-[11px] font-semibold text-[#5A8399] hover:text-[#2E5566] px-1.5 py-1.5 transition-colors"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setChangeDateDraft(group.sessionDate!);
                                  setDuplicatingDayGroupKey(null);
                                  setEditingDateGroupKey(group.key);
                                }}
                                title="Change the date for all classes on this day"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0E96B0] hover:text-[#08647E] transition-colors"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                  <line x1="16" y1="2" x2="16" y2="6" />
                                  <line x1="8" y1="2" x2="8" y2="6" />
                                  <line x1="3" y1="10" x2="21" y2="10" />
                                </svg>
                                Change date
                              </button>
                            )
                          )}
                          {group.sessionDate && (
                            duplicatingDayGroupKey === group.key ? (
                              <span className="inline-flex items-center gap-1.5">
                                <input
                                  type="date"
                                  autoFocus
                                  value={dupDayDraft}
                                  onChange={(e) => setDupDayDraft(e.target.value)}
                                  className="text-sm text-[#0D2B35] px-2 py-1 border-[1.5px] border-[#0E96B0] rounded-lg bg-white outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (dupDayDraft) duplicateGroupToDate(group, dupDayDraft);
                                    setDuplicatingDayGroupKey(null);
                                  }}
                                  className="text-[11px] font-semibold text-white bg-[#0E96B0] hover:bg-[#08647E] px-2.5 py-1.5 rounded-lg transition-colors"
                                >
                                  Duplicate
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDuplicatingDayGroupKey(null)}
                                  className="text-[11px] font-semibold text-[#5A8399] hover:text-[#2E5566] px-1.5 py-1.5 transition-colors"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  const [yy, mm, dd] = group.sessionDate!.split("-").map(Number);
                                  const nd = new Date(yy, mm - 1, dd);
                                  nd.setDate(nd.getDate() + 7);
                                  setDupDayDraft(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}-${String(nd.getDate()).padStart(2, "0")}`);
                                  setEditingDateGroupKey(null);
                                  setDuplicatingDayGroupKey(group.key);
                                }}
                                title="Copy every class on this day to a new date"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0E96B0] hover:text-[#08647E] transition-colors"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                                  <rect x="9" y="9" width="13" height="13" rx="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                                Duplicate day
                              </button>
                            )
                          )}
                        </div>
                        {group.items.map(({ session, index }, itemIdx, itemArr) => {
                          const sectionKey = (session.section ?? "").trim();
                          const prevKey = itemIdx > 0 ? (itemArr[itemIdx - 1].session.section ?? "").trim() : "";
                          const showHeader = sectionKey !== "" && sectionKey !== prevKey;
                          const classTitle = (session.label ?? "").trim();
                          return (
                            <div key={session.id ?? `${group.key}-${index}`}>
                              {/* Section header — shown when the section changes within a date */}
                              {showHeader && (
                                <div className="flex items-center justify-between gap-2 px-0.5 pt-2 pb-1">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#5A8399]">
                                    {sectionKey}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => duplicateSection(group, sectionKey)}
                                    title={`Duplicate all classes in ${sectionKey}`}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0E96B0] hover:text-[#08647E] transition-colors"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                                      <rect x="9" y="9" width="13" height="13" rx="2" />
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                    Duplicate section
                                  </button>
                                </div>
                              )}
                              <div
                                draggable={editingSessionIndex !== index}
                                onDragStart={(e) => {
                                  setDraggingIndex(index);
                                  e.dataTransfer.effectAllowed = "move";
                                }}
                                onDragEnd={() => {
                                  setDraggingIndex(null);
                                  setDragOverIndex(null);
                                }}
                                onDragOver={(e) => {
                                  if (
                                    draggingIndex !== null &&
                                    draggingIndex !== index &&
                                    (sessions[draggingIndex]?.session_date ?? "") === (session.session_date ?? "")
                                  ) {
                                    e.preventDefault();
                                    setDragOverIndex(index);
                                  }
                                }}
                                onDragLeave={() => {
                                  setDragOverIndex((cur) => (cur === index ? null : cur));
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  if (draggingIndex !== null) reorderSlot(draggingIndex, index);
                                  setDraggingIndex(null);
                                  setDragOverIndex(null);
                                }}
                                className={`border rounded-xl p-4 md:p-5 bg-white group transition-shadow ${
                                  dragOverIndex === index
                                    ? "border-[#0E96B0] shadow-[0_0_0_2px_rgba(14,150,176,0.35)]"
                                    : "border-[rgba(14,150,176,0.16)]"
                                } ${draggingIndex === index ? "opacity-50" : ""}`}
                              >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex items-start gap-2.5">
                            {editingSessionIndex !== index && (
                              <span
                                title="Drag to reorder"
                                className="mt-0.5 cursor-grab active:cursor-grabbing text-[#A0B7C2] hover:text-[#0E96B0] transition-colors flex-shrink-0 touch-none"
                              >
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                                  <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
                                  <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
                                  <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
                                </svg>
                              </span>
                            )}
                          <div className="min-w-0">
                            <div className="text-[14px] font-semibold text-[#0D2B35]">
                              {classTitle || formatTimeRange(session.time, session.end_time)}
                            </div>
                            <div className="text-xs text-[#5A8399] mt-1">
                              {formatTimeRange(session.time, session.end_time)}
                            </div>
                            <div className="text-[11px] text-[#5A8399] mt-1">
                              <span className="font-semibold text-[#2E5566]">Spots:</span> {session.capacity}
                              {session.location ? (
                                <>
                                  <span className="mx-2 text-[#A0B7C2]">·</span>
                                  <span className="font-semibold text-[#2E5566]">Location:</span> {session.location}
                                </>
                              ) : null}
                              {session.notes ? (
                                <>
                                  <span className="mx-2 text-[#A0B7C2]">·</span>
                                  Notes: {session.notes.length > 42 ? `${session.notes.slice(0, 42)}…` : session.notes}
                                </>
                              ) : null}
                            </div>
                          </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSessionIndex((cur) => {
                                  if (cur === index) {
                                    commitCapacityDraft(index);
                                    return null;
                                  }
                                  if (cur !== null) {
                                    commitCapacityDraft(cur);
                                  }
                                  return index;
                                });
                              }}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border-[1.5px] border-[#0E96B0]/30 text-[#08647E] bg-white hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all opacity-100 supports-[hover:hover]:sm:opacity-0 supports-[hover:hover]:sm:group-hover:opacity-100"
                            >
                              {editingSessionIndex === index ? "Done" : "Edit"}
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                                {editingSessionIndex === index ? (
                                  <polyline points="20 6 9 17 4 12" />
                                ) : (
                                  <>
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </>
                                )}
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSession(index)}
                              className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors px-2 py-2"
                            >
                              Remove
                            </button>
                          </div>
                        </div>

                        {editingSessionIndex === index && (
                          <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
                            <div className="col-span-2 md:col-span-3">
                              <label className="block text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] mb-1">
                                Class name <span className="normal-case font-normal text-[#5A8399]">(optional)</span>
                              </label>
                              <input
                                type="text"
                                value={session.label ?? ""}
                                onChange={(e) => updateSession(index, "label", e.target.value)}
                                placeholder="e.g. Men's Class 1"
                                className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                              />
                            </div>
                            <div className="col-span-2 md:col-span-2">
                              <label className="block text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] mb-1">
                                Section <span className="normal-case font-normal text-[#5A8399]">(optional)</span>
                              </label>
                              <input
                                type="text"
                                list="edit-session-sections"
                                value={session.section ?? ""}
                                onChange={(e) => updateSession(index, "section", e.target.value)}
                                placeholder="e.g. Men's Side"
                                className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] mb-1">
                                Start
                              </label>
                              <TimeInput
                                value={session.time}
                                onChange={(v) => updateSession(index, "time", v)}
                                className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] mb-1">
                                End
                              </label>
                              <TimeInput
                                value={session.end_time ?? ""}
                                onChange={(v) => updateSession(index, "end_time", v)}
                                placeholder="e.g. 5pm"
                                className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] mb-1">
                                Spots
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={
                                  capacityInputDraft[index] !== undefined
                                    ? capacityInputDraft[index]
                                    : String(session.capacity)
                                }
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === "" || /^\d+$/.test(raw)) {
                                    setCapacityInputDraft((prev) => ({ ...prev, [index]: raw }));
                                    if (raw !== "") {
                                      const n = parseInt(raw, 10);
                                      if (n >= 1) {
                                        updateSession(index, "capacity", n);
                                      }
                                    }
                                  }
                                }}
                                onBlur={() => commitCapacityDraft(index)}
                                onFocus={selectAllSpotsOnFocus}
                                onMouseUp={keepSpotsSelectionOnMouseUp}
                                className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] mb-1">
                                Location
                              </label>
                              <input
                                type="text"
                                value={session.location}
                                onChange={(e) => updateSession(index, "location", e.target.value)}
                                placeholder="e.g., Meetinghouse"
                                className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                              />
                            </div>
                            <div className="col-span-2 md:col-span-5">
                              <label className="block text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] mb-1">
                                Notes
                              </label>
                              <textarea
                                value={session.notes}
                                onChange={(e) => updateSession(index, "notes", e.target.value)}
                                placeholder="Optional"
                                rows={2}
                                className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70 resize-none"
                              />
                            </div>
                          </div>
                        )}
                              </div>{/* session card */}
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => addClassToDate(group)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0E96B0] hover:text-[#08647E] transition-colors px-0.5 pt-1"
                        >
                          <span className="w-4 h-4 rounded bg-[#E6F7FB] flex items-center justify-center text-[#0E96B0] leading-none">+</span>
                          Add a class to this date
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
      {showRescheduleConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-[0_8px_40px_rgba(8,100,126,0.18)] p-6 max-w-sm w-full">
            <div className="w-11 h-11 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-amber-500">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h2 className="font-serif text-[20px] text-[#0D2B35] text-center mb-2">Signups will be lost</h2>
            <p className="text-sm text-[#5A8399] text-center mb-6">
              This event has <span className="font-semibold text-[#0D2B35]">{signupCount} signup{signupCount !== 1 ? 's' : ''}</span> that will be permanently removed when sessions are replaced. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowRescheduleConfirm(false)}
                className="flex-1 text-sm font-semibold px-4 py-3 rounded-xl border-[1.5px] border-[#0E96B0]/40 text-[#08647E] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={commitReschedule}
                className="flex-1 text-sm font-semibold px-4 py-3 rounded-xl text-white bg-gradient-to-br from-amber-500 to-orange-600 shadow-[0_4px_14px_rgba(245,158,11,0.35)] hover:-translate-y-0.5 transition-all"
              >
                Reschedule anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete sessions confirmation modal (when removed sessions have signups) */}
      {showDeleteSessionsConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-[0_8px_40px_rgba(8,100,126,0.18)] p-6 max-w-sm w-full">
            <div className="w-11 h-11 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-amber-500">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h2 className="font-serif text-[20px] text-[#0D2B35] text-center mb-2">Signups will be lost</h2>
            <p className="text-sm text-[#5A8399] text-center mb-6">
              You removed session(s) that currently have <span className="font-semibold text-[#0D2B35]">{deleteSessionsSignupCount} signup{deleteSessionsSignupCount !== 1 ? "s" : ""}</span>.
              Saving will permanently remove those signups. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  pendingDeleteSessionIdsRef.current = null;
                  setShowDeleteSessionsConfirm(false);
                }}
                className="flex-1 text-sm font-semibold px-4 py-3 rounded-xl border-[1.5px] border-[#0E96B0]/40 text-[#08647E] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowDeleteSessionsConfirm(false);
                  await performSave({ allowDeleteWithSignups: true });
                  pendingDeleteSessionIdsRef.current = null;
                }}
                className="flex-1 text-sm font-semibold px-4 py-3 rounded-xl text-white bg-gradient-to-br from-amber-500 to-orange-600 shadow-[0_4px_14px_rgba(245,158,11,0.35)] hover:-translate-y-0.5 transition-all"
              >
                Save anyway
              </button>
            </div>
          </div>
        </div>
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
