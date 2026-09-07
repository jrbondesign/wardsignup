"use client";

import { Fragment, use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { supabase, getPublicCampaignById } from "@/lib/supabase";
import type { Session, CampaignItemWithSignups } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { compareBySortOrder } from "@/lib/session-sort-order";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useBrand } from "@/components/BrandProvider";
import { usePostHog } from "posthog-js/react";
import { posthogDistinctIdHeader } from "@/lib/posthog-client";

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

/** Reorder items so same-section items are contiguous (preserving each section's
 *  first-appearance order and original order within), enabling a single header
 *  per section in the render. Ungrouped items (no section) keep their position. */
function orderBySection(items: CampaignItemWithSignups[]): CampaignItemWithSignups[] {
  const order: string[] = [];
  const buckets = new Map<string, CampaignItemWithSignups[]>();
  for (const it of items) {
    const key = (it.section ?? "").trim();
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(it);
  }
  return order.flatMap((k) => buckets.get(k)!);
}

/** Public page fetches id + guest_names to compute real headcount against capacity. */
interface SessionWithSignups extends Session {
  signups:
    | {
        id: string;
        member_name: string;
        signup_note: string | null;
        guest_names: string[];
      }[]
    | null;
}

/** Same section-grouping as orderBySection, for a date's sessions (class slots). */
function orderSessionsBySection(sessions: SessionWithSignups[]): SessionWithSignups[] {
  // Pre-sort by the organizer's explicit sort_order so BOTH section order
  // (first appearance) and within-section order follow it. Falls back to
  // created_at/id for slots that predate sort_order.
  const sorted = [...sessions].sort(compareBySortOrder);
  const order: string[] = [];
  const buckets = new Map<string, SessionWithSignups[]>();
  for (const s of sorted) {
    const key = (s.section ?? "").trim();
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(s);
  }
  return order.flatMap((k) => buckets.get(k)!);
}

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const brand = useBrand();
  const posthog = usePostHog();
  const router = useRouter();
  const { id: eventId } = use(params);
  const [event, setEvent] = useState<any>(null);
  const [sessions, setSessions] = useState<SessionWithSignups[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [showSignupForm, setShowSignupForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", note: "" });
  const [guestNames, setGuestNames] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [eventType, setEventType] = useState<"spots" | "items" | "rsvp">("spots");
  const [items, setItems] = useState<CampaignItemWithSignups[]>([]);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [itemFormData, setItemFormData] = useState({ name: "", email: "", note: "", quantity: 1 });
  const [customItem, setCustomItem] = useState({ label: "", name: "", note: "" });
  const [customSubmitting, setCustomSubmitting] = useState(false);
  const [customError, setCustomError] = useState("");
  const [customSignups, setCustomSignups] = useState<{ id: string; member_name: string; custom_label: string | null; signup_note: string | null; quantity: number }[]>([]);
  const [showSignupsPublicly, setShowSignupsPublicly] = useState(false);
  const [itemSubmitting, setItemSubmitting] = useState(false);
  const [itemError, setItemError] = useState("");
  const [itemSuccess, setItemSuccess] = useState(false);
  const [allowGuests, setAllowGuests] = useState(true);
  const [showCapacityPublicly, setShowCapacityPublicly] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<{ day: number; year: number; month: number } | null>(null);

  useEffect(() => { fetchData(); }, [eventId]);

  // Single-session bypass: auto-select the only session so the form is ready immediately
  useEffect(() => {
    if ((eventType === "spots" || eventType === "rsvp") && sessions.length === 1) {
      const only = sessions[0];
      const headcount = (only.signups ?? []).length;
      if (headcount < only.capacity) {
        setSelectedSessions([only.id]);
      }
    }
  }, [sessions, eventType]);

  const fetchData = async () => {
    try {
      // Select * (not an explicit list) so sort_order is included when present
      // but its absence on an un-migrated brand doesn't error the query.
      const sessionsSelect =
        "*, signups(id, member_name, signup_note, guest_names)";

      // RLS on campaigns is org-scoped post-PR-7, so anon visitors can no longer
      // do a direct table read. Visibility flags now ride along on the public RPC,
      // which is SECURITY DEFINER and bypasses RLS for the public-safe columns.
      const pubResult = await getPublicCampaignById(eventId);

      const { data: pubRows, error: eventError } = pubResult;
      const rows = Array.isArray(pubRows) ? pubRows : pubRows ? [pubRows] : [];
      const eventData = rows[0] as
        | {
            id: string;
            name: string;
            description: string | null;
            event_type?: string | null;
            show_signups_publicly?: boolean | null;
            allow_guests?: boolean | null;
            show_capacity_publicly?: boolean | null;
          }
        | undefined;
      if (eventError || !eventData) throw eventError ?? new Error("Event not found");

      const resolvedType: "spots" | "items" | "rsvp" =
        eventData.event_type === "items" ? "items"
        : eventData.event_type === "rsvp" ? "rsvp"
        : "spots";
      setEventType(resolvedType);
      setShowSignupsPublicly(Boolean(eventData.show_signups_publicly));
      // allow_guests defaults true (null/undefined = true for existing events)
      setAllowGuests(eventData.allow_guests == null ? true : Boolean(eventData.allow_guests));
      // show_capacity_publicly defaults true
      setShowCapacityPublicly(eventData.show_capacity_publicly == null ? true : Boolean(eventData.show_capacity_publicly));

      if (resolvedType === "items") {
        const { data: itemsData, error: itemsError } = await supabase
          .from("campaign_items")
          .select("*, item_signups(id, member_name, member_email, signup_note, quantity)")
          .eq("campaign_id", eventId)
          .order("sort_order")
          .order("created_at");
        if (itemsError) throw itemsError;
        setItems((itemsData || []) as CampaignItemWithSignups[]);

        // Custom write-in signups (item_id IS NULL): fetch separately so the public list
        // can show what other people are also bringing.
        const { data: customRows } = await supabase
          .from("item_signups")
          .select("id, member_name, custom_label, signup_note, quantity")
          .eq("campaign_id", eventId)
          .is("item_id", null)
          .order("signed_up_at");
        setCustomSignups((customRows ?? []) as never);

        setEvent(eventData);
        return;
      }

      const { data: sessionsData, error: sessionsError } = await supabase
        .from("sessions")
        .select(sessionsSelect)
        .eq("campaign_id", eventId)
        .order("session_date", { nullsFirst: false })
        // sort_order is applied client-side (orderSessionsBySection) so this
        // works whether or not the column exists yet.
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (sessionsError) throw sessionsError;

      setEvent(eventData);
      setSessions((sessionsData || []) as SessionWithSignups[]);

      // Initialize calendar to the month of the earliest upcoming session
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const futureDates = (sessionsData || [])
        .filter((s: any) => s.session_date)
        .map((s: any) => { const [y, m, d] = s.session_date.split("-").map(Number); return new Date(y, m - 1, d); })
        .filter((d: Date) => d >= today)
        .sort((a: Date, b: Date) => a.getTime() - b.getTime());
      if (futureDates.length > 0) {
        setCalendarMonth(new Date(futureDates[0].getFullYear(), futureDates[0].getMonth(), 1));
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Failed to load event");
    } finally {
      setLoading(false);
    }
  };

  const toggleSessionSelection = (sessionId: string) => {
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
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to sign up");
      }
      posthog?.capture("item_signup_completed", { campaign_id: eventId, item_id: itemId, has_email: Boolean(itemFormData.email), quantity: itemFormData.quantity });
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
      const res = await fetch("/api/item-signups", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...posthogDistinctIdHeader() },
        body: JSON.stringify({
          campaign_id: eventId,
          custom_label: customItem.label.trim(),
          member_name: customItem.name.trim(),
          signup_note: customItem.note.trim() || null,
          quantity: 1,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to add your contribution");
      }
      posthog?.capture("item_signup_completed", { campaign_id: eventId, custom: true });
      setCustomItem({ label: "", name: "", note: "" });
      fetchData();
    } catch (err: any) {
      setCustomError(err.message || "Failed to add your contribution");
    } finally {
      setCustomSubmitting(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    // For single-session events (rsvp/spots with one session), auto-use that session
    const sessionsToSignUp = isSingleSession && sessions.length === 1
      ? [sessions[0].id]
      : selectedSessions;
    if (sessionsToSignUp.length === 0) { setError("Please select at least one session"); return; }
    if (!formData.name.trim()) { setError("Please enter your name"); return; }

    setSubmitting(true);
    setError("");

    try {
      const cleanGuests = guestNames.map((n) => n.trim()).filter(Boolean);

      // Single bulk request → single confirmation email covering every slot.
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

      posthog?.capture("signup_completed", { campaign_id: eventId, session_count: selectedSessions.length, has_email: Boolean(formData.email), has_phone: Boolean(formData.phone) });

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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4FAFB] flex items-center justify-center">
        <LoadingSpinner size="xl" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-[#F4FAFB] flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-[0_8px_32px_rgba(8,100,126,0.10)] p-10 max-w-md w-full text-center">
          <h1 className="font-serif text-2xl text-[#0D2B35] mb-3">Event not found</h1>
          <p className="text-sm text-[#5A8399]">This event may have been removed or the link is incorrect.</p>
        </div>
      </div>
    );
  }

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

  return (
    <div className="min-h-screen bg-[#F4FAFB] flex flex-col">
      {/* Minimal branding header */}
      <header className="bg-white border-b border-[#0E96B0]/10 flex-shrink-0">
        <div className="max-w-4xl mx-auto px-6 min-h-[60px] py-2 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 no-underline min-w-0">
            <Image src={brand.logoSrc} alt={brand.logoAlt} width={28} height={28} className="rounded-[7px] flex-shrink-0" />
            <span className="font-serif text-lg text-[#0D2B35] tracking-[0.5px]"
                  style={{ WebkitTextStroke: "0.3px #0D2B35" }}>
              {brand.name}
            </span>
          </Link>
          <Link
            href="/"
            className="text-xs sm:text-sm font-semibold text-[#0E96B0] hover:text-[#08647E] transition-colors no-underline text-right leading-snug max-w-[11rem] sm:max-w-none"
          >
            Create your own signup
          </Link>
        </div>
      </header>

      <main
        className={`flex-1 w-full max-w-4xl mx-auto px-6 pt-5 ${
          !isSingleSession && selectedSessions.length > 0 && !showSignupForm ? "pb-32" : "pb-10"
        }`}
      >

        {/* Event card */}
        <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden mb-6">
          {/* Cover image (Ministry brand only) or gradient strip */}
          {brand.id === "ministrysignup" && event.cover_image_url ? (
            <div className="relative w-full aspect-[2/1] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={event.cover_image_url}
                alt={event.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="h-1.5 bg-gradient-to-r from-[#22C8D8] via-[#0E96B0] to-[#08647E]" />
          )}
          <div className="p-7">
            <div className="flex items-start gap-3 mb-2">
              {/* Organizer logo (Ministry brand only) */}
              {brand.id === "ministrysignup" && event.organizer_logo_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={event.organizer_logo_url}
                  alt="Organizer"
                  className="w-14 h-14 rounded-xl object-cover border border-[#0E96B0]/20 shadow-sm flex-shrink-0"
                />
              )}
              <h1 className="font-serif text-[clamp(22px,4vw,34px)] text-[#0D2B35] tracking-[-0.4px] leading-tight">
                {event.name}
              </h1>
            </div>
            {event.description && (
              <p className="text-sm text-[#5A8399] leading-relaxed whitespace-pre-wrap mt-2">
                {event.description}
              </p>
            )}
            {(() => {
              const ev = event as unknown as {
                event_date?: string | null;
                event_dates?: string[] | null;
                event_start_time?: string | null;
                event_end_time?: string | null;
                event_times?: { label: string; time: string }[];
                event_locations?: { label: string; address: string }[];
              };
              const fmtDate = (d: string) => {
                const [y, m, dd] = d.split("-").map(Number);
                return new Date(y, m - 1, dd).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
              };
              const fmtTime = (t: string) => /^\d{2}:\d{2}/.test(t) ? new Date(`1970-01-01T${t.length === 5 ? t + ":00" : t}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : t;
              // Multi-date items events: render the set as a group ("Thursdays ·
              // Jun 26, Jul 2, Jul 9") instead of the single event_date row.
              const multiDates = (ev.event_dates ?? []).filter(Boolean);
              const hasMultiDates = multiDates.length > 1;
              const timeSuffix =
                ev.event_start_time || ev.event_end_time
                  ? ` · ${ev.event_start_time ? fmtTime(ev.event_start_time) : ""}${ev.event_end_time ? ` – ${fmtTime(ev.event_end_time)}` : ""}`
                  : "";
              const weekdaysOf = (dates: string[]) => {
                const set = new Set(
                  dates.map((d) => {
                    const [y, m, dd] = d.split("-").map(Number);
                    return new Date(y, m - 1, dd).getDay();
                  })
                );
                if (set.size !== 1) return "";
                const [y, m, dd] = dates[0].split("-").map(Number);
                return new Date(y, m - 1, dd).toLocaleDateString("en-US", { weekday: "long" }) + "s";
              };
              const fmtShort = (d: string) => {
                const [y, m, dd] = d.split("-").map(Number);
                return new Date(y, m - 1, dd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
              };
              const hasInfo = ev.event_date || hasMultiDates || ev.event_start_time || ev.event_end_time || (ev.event_times?.length ?? 0) > 0 || (ev.event_locations?.length ?? 0) > 0;
              if (!hasInfo) return null;
              return (
                <div className="mt-3 pt-3 border-t border-[#0E96B0]/8 space-y-1.5 text-sm text-[#2E5566]">
                  {hasMultiDates ? (
                    <div className="flex items-start gap-2">
                      <svg viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0 mt-0.5">
                        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      <span>
                        {weekdaysOf(multiDates) && (
                          <span className="font-medium">{weekdaysOf(multiDates)} · </span>
                        )}
                        <span className="font-medium">{multiDates.map(fmtShort).join(", ")}</span>
                        {timeSuffix && <span className="text-[#5A8399]">{timeSuffix}</span>}
                      </span>
                    </div>
                  ) : (
                    ev.event_date && (
                      <div className="flex items-center gap-2">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
                          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        <span className="font-medium">{fmtDate(ev.event_date)}</span>
                        {(ev.event_start_time || ev.event_end_time) && (
                          <span className="text-[#5A8399]">
                            · {ev.event_start_time ? fmtTime(ev.event_start_time) : ""}
                            {ev.event_end_time ? ` – ${fmtTime(ev.event_end_time)}` : ""}
                          </span>
                        )}
                      </div>
                    )
                  )}
                  {(ev.event_times ?? []).map((t, i) => (
                    <div key={`t${i}`} className="flex items-center gap-2">
                      <svg viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                      </svg>
                      {t.label && <span className="font-medium">{t.label}:</span>}
                      <span className="text-[#5A8399]">{t.time ? fmtTime(t.time) : ""}</span>
                    </div>
                  ))}
                  {(ev.event_locations ?? []).map((l, i) => (
                    <div key={`l${i}`} className="flex items-start gap-2">
                      <svg viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0 mt-0.5">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                      </svg>
                      {l.label && <span className="font-medium">{l.label}:</span>}
                      <span className="text-[#5A8399]">{l.address}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div className="mt-4 pt-4 border-t border-[#0E96B0]/8 text-xs text-[#5A8399] flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-[#0E96B0]">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {eventType === "items"
                ? "Claim an item below to sign up"
                : isSingleSession
                ? "Fill in your information below to register"
                : "Select sessions below, then complete your sign up"}
            </div>
          </div>
        </div>

        {/* Success banner */}
        {success && (
          <div className="bg-[#edfaf4] border border-[#1D9E75]/25 rounded-xl px-5 py-4 mb-6 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1D9E75] to-[#0F6E56] flex-shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-[#0F6E56]">You're signed up!</div>
              <div className="text-xs text-[#1D9E75]">Thank you for volunteering.</div>
            </div>
          </div>
        )}

        {/* ── Single-session inline form ──────────────────────────────────── */}
        {isSingleSession && (eventType === "spots" || eventType === "rsvp") && !success && (
          <div className="mb-6">
            {singleSessionFull ? (
              <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-10 text-center">
                <div className="w-12 h-12 rounded-full bg-[#F4FAFB] border border-[#0E96B0]/20 flex items-center justify-center mx-auto mb-4">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-[#5A8399]">
                    <circle cx="12" cy="12" r="10"/><line x1="8" y1="8" x2="16" y2="16"/><line x1="16" y1="8" x2="8" y2="16"/>
                  </svg>
                </div>
                <h2 className="font-serif text-xl text-[#0D2B35] mb-2">This event is full</h2>
                <p className="text-sm text-[#5A8399]">All spots have been filled. Check back later in case a spot opens up.</p>
                {showSignupsPublicly && singleSession && (singleSession.signups?.length ?? 0) > 0 && (
                  <div className="mt-6 pt-6 border-t border-[#0E96B0]/8 text-left">
                    <div className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.3px] mb-2">
                      Signed up
                    </div>
                    <div className="space-y-1">
                      {singleSession.signups!.map((sig) => (
                        <div key={sig.id} className="text-xs text-[#2E5566]">
                          <span className="font-medium">{sig.member_name}</span>
                          {sig.guest_names?.length > 0 && (
                            <span className="text-[#5A8399]"> +{sig.guest_names.length}</span>
                          )}
                          {sig.signup_note && (
                            <span className="text-[#5A8399]"> — {sig.signup_note}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-7">
                {/* Session info as static context */}
                {singleSession && (
                  <div className="flex items-center gap-2 text-sm text-[#5A8399] mb-5 pb-5 border-b border-[#0E96B0]/8">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#0E96B0] flex-shrink-0">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <span>
                      {singleSession.session_date
                        ? (() => { const [y,m,d] = singleSession.session_date!.split("-").map(Number); return new Date(y, m-1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }); })()
                        : DAYS[singleSession.day_of_week]}
                      {" · "}{formatTime(singleSession.time)}
                      {singleSession.end_time && ` – ${formatTime(singleSession.end_time)}`}
                      {singleSession.location && ` · ${singleSession.location}`}
                    </span>
                    {showCapacityPublicly && singleSession.capacity < 999 && (
                      <span className="ml-auto text-[#1D9E75] font-semibold flex-shrink-0">
                        {singleSession.capacity - sessionHeadcount(singleSession)} {singleSession.capacity - sessionHeadcount(singleSession) === 1 ? "spot" : "spots"} left
                      </span>
                    )}
                  </div>
                )}

                {showSignupsPublicly && singleSession && (singleSession.signups?.length ?? 0) > 0 && (
                  <div className="mb-5 pb-5 border-b border-[#0E96B0]/8">
                    <div className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.3px] mb-2">
                      Signed up
                    </div>
                    <div className="space-y-1">
                      {singleSession.signups!.map((sig) => (
                        <div key={sig.id} className="text-xs text-[#2E5566]">
                          <span className="font-medium">{sig.member_name}</span>
                          {sig.guest_names?.length > 0 && (
                            <span className="text-[#5A8399]"> +{sig.guest_names.length}</span>
                          )}
                          {sig.signup_note && (
                            <span className="text-[#5A8399]"> — {sig.signup_note}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <h2 className="font-serif text-2xl text-[#0D2B35] mb-5">Register for this event</h2>

                <form onSubmit={handleSignup} className="space-y-4">
                  <div>
                    <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1.5">
                      Your Name <span className="text-red-400">*</span>
                    </label>
                    <input type="text" value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="First and last name"
                      className="w-full text-sm text-[#0D2B35] px-[16px] py-[12px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399]/70"
                      required disabled={submitting} />
                  </div>
                  <div>
                    <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1.5">
                      Email <span className="text-[#5A8399] font-normal">(optional)</span>
                    </label>
                    <input type="email" value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="you@example.com"
                      className="w-full text-sm text-[#0D2B35] px-[16px] py-[12px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399]/70"
                      disabled={submitting} />
                    <p className="mt-1.5 text-[11px] text-[#5A8399] leading-snug">
                      {sessions.some((s: any) => s.session_date)
                        ? "Add your email to get a reminder the day before — we never share or sell your info."
                        : "Optional — for updates from the organizer. We never share or sell your info."}
                    </p>
                  </div>
                  <div>
                    <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1.5">
                      Phone <span className="text-[#5A8399] font-normal">(optional)</span>
                    </label>
                    <input type="tel" value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(555) 123-4567"
                      className="w-full text-sm text-[#0D2B35] px-[16px] py-[12px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399]/70"
                      disabled={submitting} />
                  </div>
                  <div>
                    <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1.5">
                      Note <span className="text-[#5A8399] font-normal">(optional)</span>
                    </label>
                    <textarea value={formData.note}
                      onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                      placeholder="Anything you'd like to share with the organizer"
                      rows={2}
                      className="w-full text-sm text-[#0D2B35] px-[16px] py-[12px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399]/70 resize-none"
                      disabled={submitting} />
                  </div>
                  {allowGuests && guestNameFields}
                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
                  )}
                  <button type="submit" disabled={submitting}
                    className="w-full text-base font-semibold px-4 py-[15px] rounded-xl text-white bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] shadow-[0_6px_20px_rgba(14,150,176,0.38)] hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(14,150,176,0.45)] active:translate-y-0 transition-all disabled:opacity-60 disabled:cursor-default disabled:translate-y-0">
                    {submitting ? "Signing up…" : "Sign Up"}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* ── Items type ─────────────────────────────────────────────────── */}
        {eventType === "items" && (
          <div className="space-y-3 mb-10">
            {items.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-10 text-center">
                <p className="text-sm text-[#5A8399]">No items listed yet. Check back soon!</p>
              </div>
            ) : (
              orderBySection(items).map((item, idx, arr) => {
                const claimed = (item.item_signups ?? []).reduce((s, r) => s + ((r as { quantity?: number }).quantity ?? 1), 0);
                const limit = item.item_limit;
                const remaining = limit !== null ? Math.max(0, limit - claimed) : null;
                const isFull = limit !== null && claimed >= limit;
                const isExpanded = expandedItem === item.id;
                const sectionKey = (item.section ?? "").trim();
                const prevKey = idx > 0 ? (arr[idx - 1].section ?? "").trim() : "";
                const showHeader = sectionKey !== "" && sectionKey !== prevKey;

                return (
                  <Fragment key={item.id}>
                  {showHeader && (
                    <div className="pt-3 first:pt-0">
                      <h3 className="text-[12px] font-semibold uppercase tracking-[0.4px] text-[#5A8399] px-1">
                        {sectionKey}
                      </h3>
                    </div>
                  )}
                  <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden">
                    <div className="p-5 flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[15px] text-[#0D2B35] leading-snug">{item.label}</div>
                        <div className="text-xs text-[#5A8399] mt-0.5">
                          {isFull
                            ? `Full — ${claimed} claimed`
                            : limit !== null
                            ? `${claimed} of ${limit} claimed`
                            : claimed > 0
                            ? `${claimed} claimed`
                            : "No one yet — be first!"}
                        </div>
                      </div>
                      {!isFull && (
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedItem(isExpanded ? null : item.id);
                            setItemError("");
                          }}
                          className={`text-sm font-semibold px-4 py-2 rounded-xl transition-all flex-shrink-0 ${
                            isExpanded
                              ? "bg-[#F4FAFB] text-[#5A8399] border border-[rgba(14,150,176,0.22)]"
                              : "bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.3)] hover:-translate-y-0.5"
                          }`}
                        >
                          {isExpanded ? "Cancel" : "Claim"}
                        </button>
                      )}
                      {isFull && (
                        <span className="text-xs font-semibold text-[#5A8399] bg-[#F4FAFB] px-3 py-1.5 rounded-xl border border-[rgba(14,150,176,0.14)] flex-shrink-0">
                          Full
                        </span>
                      )}
                    </div>

                    {showSignupsPublicly && item.item_signups.length > 0 && (
                      <div className="border-t border-[#0E96B0]/10 px-5 py-3">
                        <div className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.3px] mb-2">
                          Also signed up
                        </div>
                        <div className="space-y-1">
                          {item.item_signups.map((sig) => (
                            <div key={sig.id} className="text-xs text-[#2E5566]">
                              <span className="font-medium">{sig.member_name}</span>
                              {sig.signup_note && (
                                <span className="text-[#5A8399]"> — {sig.signup_note}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {isExpanded && (
                      <div className="border-t border-[#0E96B0]/10 bg-[#F4FAFB] px-5 py-4">
                        {itemError && (
                          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl mb-3 text-sm">
                            {itemError}
                          </div>
                        )}
                        <form onSubmit={(e) => handleItemSignup(e, item.id)} className="space-y-3">
                          <div>
                            <label className="block text-[12px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">
                              How many?
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setItemFormData((prev) => ({ ...prev, quantity: Math.max(1, prev.quantity - 1) }))}
                                disabled={itemSubmitting || itemFormData.quantity <= 1}
                                aria-label="Decrease quantity"
                                className="w-9 h-9 flex items-center justify-center rounded-lg border-[1.5px] border-[rgba(14,150,176,0.22)] bg-white text-[#0E96B0] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >−</button>
                              <input
                                type="number"
                                min={1}
                                max={remaining ?? undefined}
                                value={itemFormData.quantity}
                                onChange={(e) => {
                                  const n = parseInt(e.target.value, 10);
                                  const next = Number.isFinite(n) && n > 0 ? n : 1;
                                  setItemFormData((prev) => ({ ...prev, quantity: remaining !== null ? Math.min(next, remaining) : next }));
                                }}
                                aria-label="Quantity"
                                className="w-16 text-center text-sm text-[#0D2B35] px-2 py-2 border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-lg bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                                disabled={itemSubmitting}
                              />
                              <button
                                type="button"
                                onClick={() => setItemFormData((prev) => ({ ...prev, quantity: remaining !== null ? Math.min(remaining, prev.quantity + 1) : prev.quantity + 1 }))}
                                disabled={itemSubmitting || (remaining !== null && itemFormData.quantity >= remaining)}
                                aria-label="Increase quantity"
                                className="w-9 h-9 flex items-center justify-center rounded-lg border-[1.5px] border-[rgba(14,150,176,0.22)] bg-white text-[#0E96B0] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >+</button>
                              {remaining !== null && (
                                <span className="text-[11px] text-[#5A8399] ml-1">{remaining} left</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <label className="block text-[12px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">
                              Your name *
                            </label>
                            <input
                              type="text"
                              value={itemFormData.name}
                              onChange={(e) => setItemFormData((prev) => ({ ...prev, name: e.target.value }))}
                              placeholder="First and last name"
                              required
                              className="w-full text-sm text-[#0D2B35] px-[14px] py-[11px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                              disabled={itemSubmitting}
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">
                              Email <span className="font-normal text-[#5A8399]">(optional)</span>
                            </label>
                            <input
                              type="email"
                              value={itemFormData.email}
                              onChange={(e) => setItemFormData((prev) => ({ ...prev, email: e.target.value }))}
                              placeholder="you@example.com"
                              className="w-full text-sm text-[#0D2B35] px-[14px] py-[11px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                              disabled={itemSubmitting}
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">
                              Note <span className="font-normal text-[#5A8399]">(optional)</span>
                            </label>
                            <textarea
                              value={itemFormData.note}
                              onChange={(e) => setItemFormData((prev) => ({ ...prev, note: e.target.value }))}
                              placeholder="e.g. I'll bring scrambled eggs and orange juice"
                              rows={2}
                              className="w-full text-sm text-[#0D2B35] px-[14px] py-[11px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70 resize-none"
                              disabled={itemSubmitting}
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={itemSubmitting}
                            className="w-full text-sm font-semibold py-[11px] rounded-xl text-white bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] shadow-[0_4px_14px_rgba(14,150,176,0.35)] hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:cursor-default disabled:translate-y-0"
                          >
                            {itemSubmitting ? "Saving…" : "Confirm"}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                  </Fragment>
                );
              })
            )}

            {/* Custom write-in: "I'm also bringing…" */}
            <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#0E96B0]/8">
                <div className="font-semibold text-[15px] text-[#0D2B35]">I&apos;m also bringing…</div>
                <div className="text-xs text-[#5A8399] mt-0.5">
                  Got something not on the list? Add it here so the organizer knows.
                </div>
              </div>
              {showSignupsPublicly && customSignups.length > 0 && (
                <div className="px-5 py-3 border-b border-[#0E96B0]/8 space-y-1">
                  {customSignups.map((sig) => (
                    <div key={sig.id} className="text-xs text-[#2E5566]">
                      <span className="font-medium">{sig.member_name}</span>
                      <span className="text-[#5A8399]"> — {sig.custom_label}</span>
                      {sig.signup_note && <span className="text-[#5A8399]"> · {sig.signup_note}</span>}
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={handleCustomItemSignup} className="px-5 py-4 space-y-3 bg-[#F4FAFB]">
                {customError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-sm">{customError}</div>
                )}
                <div>
                  <label className="block text-[12px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">What will you bring? *</label>
                  <input
                    type="text"
                    value={customItem.label}
                    onChange={(e) => setCustomItem((p) => ({ ...p, label: e.target.value }))}
                    placeholder="e.g. a trailer, a generator, extra chairs"
                    maxLength={200}
                    className="w-full text-sm text-[#0D2B35] px-[14px] py-[11px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                    disabled={customSubmitting}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">Your name *</label>
                  <input
                    type="text"
                    value={customItem.name}
                    onChange={(e) => setCustomItem((p) => ({ ...p, name: e.target.value }))}
                    placeholder="First and last name"
                    className="w-full text-sm text-[#0D2B35] px-[14px] py-[11px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                    disabled={customSubmitting}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">Note <span className="font-normal text-[#5A8399]">(optional)</span></label>
                  <input
                    type="text"
                    value={customItem.note}
                    onChange={(e) => setCustomItem((p) => ({ ...p, note: e.target.value }))}
                    placeholder="Any details the organizer should know"
                    className="w-full text-sm text-[#0D2B35] px-[14px] py-[11px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                    disabled={customSubmitting}
                  />
                </div>
                <button
                  type="submit"
                  disabled={customSubmitting || !customItem.label.trim() || !customItem.name.trim()}
                  className="w-full text-sm font-semibold py-[11px] rounded-xl text-white bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] shadow-[0_4px_14px_rgba(14,150,176,0.35)] hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-default disabled:translate-y-0"
                >
                  {customSubmitting ? "Adding…" : "Add my contribution"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── Spots type: view toggle + session list (hidden for single-session) ── */}
        {/* Calendar toggle */}
        {!isSingleSession && eventType === "spots" && Object.keys(groupedSessions).length > 0 && (
          <div id="view-toggle" className="flex items-center justify-end mb-4">
            <button
              onClick={() => {
                if (viewMode === "calendar") {
                  setViewMode("list");
                  setSelectedCalendarDate(null);
                } else {
                  setViewMode("calendar");
                }
              }}
              className="flex items-center gap-1.5 text-sm font-semibold text-[#0E96B0] hover:text-[#08647E] transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              {viewMode === "calendar" ? "Hide Calendar" : "Show Calendar"}
            </button>
          </div>
        )}

        {/* Sessions — spots/rsvp type, multi-session only (hidden when isSingleSession) */}
        {!isSingleSession && (eventType === "spots" || eventType === "rsvp") && (
          Object.keys(groupedSessions).length === 0 ? (
            <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-10 text-center">
              <p className="text-sm text-[#5A8399]">No sessions available yet. Check back later!</p>
            </div>
          ) : null
        )}
        {!isSingleSession && (eventType === "spots" || eventType === "rsvp") && Object.keys(groupedSessions).length > 0 && (
          <div className="space-y-4 mb-32">
            {/* Mini Calendar — shown in calendar view */}
            {viewMode === "calendar" && (
              <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden">
                {/* Calendar header */}
                <div className="px-6 py-4 border-b border-[#0E96B0]/8 bg-gradient-to-r from-[#F4FAFB] to-white flex items-center justify-between">
                  <button
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#E6F7FB] text-[#5A8399] hover:text-[#0E96B0] transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                  </button>
                  <span className="font-serif text-base text-[#0D2B35]">
                    {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </span>
                  <button
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#E6F7FB] text-[#5A8399] hover:text-[#0E96B0] transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                </div>

                <div className="p-4">
                  {/* Day-of-week headers */}
                  <div className="grid grid-cols-7 mb-1">
                    {["S","M","T","W","T","F","S"].map((label, i) => (
                      <div key={i} className="text-center text-[11px] font-semibold text-[#5A8399] tracking-[0.5px] py-1">
                        {label}
                      </div>
                    ))}
                  </div>

                  {/* Day cells */}
                  {(() => {
                    const year = calendarMonth.getFullYear();
                    const month = calendarMonth.getMonth();
                    const firstDayOfWeek = new Date(year, month, 1).getDay();
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const today = new Date();
                    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
                    const todayDate = today.getDate();

                    // Compute which days have sessions and which have available spots
                    const sessionDays = new Set<number>();
                    const availableDays = new Set<number>();
                    // In the current month, past days shouldn't be markable.
                    const isPastDay = (d: number) => isCurrentMonth && d < todayDate;
                    for (const session of sessions) {
                      const hasSpot = sessionHeadcount(session) < session.capacity;
                      if (session.session_date) {
                        const [sy, sm, sd] = session.session_date.split("-").map(Number);
                        if (sy === year && sm - 1 === month && !isPastDay(sd)) {
                          sessionDays.add(sd);
                          if (hasSpot) availableDays.add(sd);
                        }
                      } else {
                        for (let d = 1; d <= daysInMonth; d++) {
                          if (isPastDay(d)) continue;
                          if (new Date(year, month, d).getDay() === session.day_of_week) {
                            sessionDays.add(d);
                            if (hasSpot) availableDays.add(d);
                          }
                        }
                      }
                    }

                    const cells = [];
                    for (let i = 0; i < firstDayOfWeek; i++) {
                      cells.push(<div key={`e${i}`} />);
                    }
                    for (let d = 1; d <= daysInMonth; d++) {
                      const hasSession = sessionDays.has(d);
                      const hasAvailable = availableDays.has(d);
                      const isToday = isCurrentMonth && d === todayDate;
                      const isSelected = selectedCalendarDate?.day === d && selectedCalendarDate?.year === year && selectedCalendarDate?.month === month;
                      cells.push(
                        <div
                          key={d}
                          onClick={() => hasSession && handleCalendarDateClick(d, year, month)}
                          className={`flex flex-col items-center rounded-lg transition-colors ${
                            hasSession ? "cursor-pointer" : ""
                          } ${isSelected ? "bg-[#E6F7FB]" : hasSession ? "hover:bg-[#F4FAFB]" : ""}`}
                        >
                          <div className={`mt-2 w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium transition-all ${
                            isSelected
                              ? "bg-[#0E96B0] text-white ring-2 ring-[#0E96B0]/30 ring-offset-1"
                              : isToday
                              ? "bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white"
                              : hasSession
                              ? "text-[#0D2B35] font-semibold"
                              : "text-[#B0C8D4]"
                          }`}>
                            {d}
                          </div>
                          <div className={`w-1.5 h-1.5 rounded-full mt-0.5 mb-1 transition-colors ${
                            hasAvailable ? (isSelected ? "bg-[#0E96B0]" : "bg-[#22C8D8]") : "bg-transparent"
                          }`} />
                        </div>
                      );
                    }
                    return <div className="grid grid-cols-7 gap-y-0.5">{cells}</div>;
                  })()}
                </div>
              </div>
            )}


            {/* No sessions for this date */}
            {selectedCalendarDate && Object.keys(groupedSessions).length === 0 && (
              <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-8 text-center">
                <p className="text-sm text-[#5A8399]">No sessions on this date.</p>
              </div>
            )}

            {Object.entries(groupedSessions).map(([dateKey, daySessions]) => {
              const headerLabel = dateKey.startsWith("dow-")
                ? DAYS[parseInt(dateKey.slice(4))]
                : (() => {
                    const [y, m, d] = dateKey.split("-").map(Number);
                    return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
                  })();

              const availableSessions = daySessions.filter((s) => sessionHeadcount(s) < s.capacity);
              const allDaySelected = availableSessions.length > 0 && availableSessions.every((s) => selectedSessions.includes(s.id));

              return (
                <div key={dateKey} id={`day-${dateKey}`} className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden">
                  <div className="px-6 py-4 border-b border-[#0E96B0]/8 bg-gradient-to-r from-[#F4FAFB] to-white flex items-center justify-between">
                    <h2 className="font-serif text-xl text-[#0D2B35]">{headerLabel}</h2>
                    {availableSessions.length > 0 && (
                      <button onClick={() => selectAllDaySessions(daySessions)}
                        className="text-xs font-semibold text-[#0E96B0] hover:text-[#08647E] transition-colors">
                        {allDaySelected ? "Deselect All" : "Select All"}
                      </button>
                    )}
                  </div>

                  <div className="p-4 space-y-2">
                    {orderSessionsBySection(daySessions).map((session, sIdx, sArr) => {
                      const filled = sessionHeadcount(session);
                      const isFull = filled >= session.capacity;
                      const isSelected = selectedSessions.includes(session.id);
                      const sectionKey = (session.section ?? "").trim();
                      const prevKey = sIdx > 0 ? (sArr[sIdx - 1].section ?? "").trim() : "";
                      const showHeader = sectionKey !== "" && sectionKey !== prevKey;

                      return (
                        <Fragment key={session.id}>
                          {showHeader && (
                            <h3 className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[#5A8399] px-1 pt-3 first:pt-1">
                              {sectionKey}
                            </h3>
                          )}
                          <button
                            onClick={() => !isFull && toggleSessionSelection(session.id)}
                            disabled={isFull}
                            className={`w-full text-left border-[1.5px] rounded-xl p-4 transition-all ${
                              isSelected
                                ? "border-[#0E96B0] bg-[#E6F7FB]"
                                : isFull
                                ? "border-[#0E96B0]/10 bg-[#F4FAFB] cursor-not-allowed opacity-60"
                                : "border-[#0E96B0]/15 hover:border-[#0E96B0]/45 hover:bg-[#F4FAFB]"
                            }`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-start gap-3 flex-1">
                                <div className={`w-[18px] h-[18px] border-2 rounded-[5px] flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                  isSelected ? "bg-[#0E96B0] border-[#0E96B0]" : isFull ? "bg-[#E6F7FB] border-[#0E96B0]/20" : "border-[#0E96B0]/30"
                                }`}>
                                  {isSelected && (
                                    <svg className="w-2.5 h-2.5 text-white" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24" stroke="currentColor">
                                      <path d="M5 13l4 4L19 7"/>
                                    </svg>
                                  )}
                                </div>
                                <div className="flex-1">
                                  <div className="text-sm font-semibold text-[#0D2B35]">
                                    {session.label || (
                                      <>
                                        {formatTime(session.time)}
                                        {session.end_time && ` – ${formatTime(session.end_time)}`}
                                      </>
                                    )}
                                    {session.location && <span className="text-[#5A8399] font-normal"> · {session.location}</span>}
                                  </div>
                                  {session.label && (
                                    <div className="text-xs text-[#5A8399] mt-0.5">
                                      {formatTime(session.time)}
                                      {session.end_time && ` – ${formatTime(session.end_time)}`}
                                    </div>
                                  )}
                                  {session.notes && <div className="text-xs text-[#5A8399] mt-0.5">{session.notes}</div>}
                                </div>
                              </div>
                              {(isFull || (showCapacityPublicly && session.capacity < 999)) && (
                                <div className="text-right flex-shrink-0 ml-4">
                                  <div className={`text-xs font-semibold ${isFull ? "text-red-500" : "text-[#1D9E75]"}`}>
                                    {isFull ? "Full" : `${session.capacity - filled} left`}
                                  </div>
                                  {showCapacityPublicly && session.capacity < 999 && (
                                    <div className="text-[11px] text-[#5A8399]">{filled}/{session.capacity} filled</div>
                                  )}
                                </div>
                              )}
                            </div>
                          </button>
                          {showSignupsPublicly && (session.signups?.length ?? 0) > 0 && (
                            <div className="mt-1.5 ml-7 mr-1 px-3 py-2 rounded-lg bg-[#F4FAFB] border border-[#0E96B0]/10">
                              <div className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.3px] mb-1">
                                Signed up
                              </div>
                              <div className="space-y-0.5">
                                {session.signups!.map((sig) => (
                                  <div key={sig.id} className="text-xs text-[#2E5566]">
                                    <span className="font-medium">{sig.member_name}</span>
                                    {sig.guest_names?.length > 0 && (
                                      <span className="text-[#5A8399]"> +{sig.guest_names.length}</span>
                                    )}
                                    {sig.signup_note && (
                                      <span className="text-[#5A8399]"> — {sig.signup_note}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating action bar — hidden for single-session (uses inline form instead) */}
      {!isSingleSession && selectedSessions.length > 0 && !showSignupForm && (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <div className="bg-white border-t border-[#0E96B0]/12 shadow-[0_-8px_32px_rgba(8,100,126,0.12)] px-6 py-4">
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-[#0D2B35]">
                  {selectedSessions.length} {selectedSessions.length === 1 ? "session" : "sessions"} selected
                </div>
                <div className="text-xs text-[#5A8399]">Continue to enter your information</div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => setSelectedSessions([])}
                  className="text-sm font-medium px-4 py-2 rounded-xl border-[1.5px] border-[#0E96B0]/30 text-[#2E5566] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all">
                  Clear
                </button>
                <button onClick={() => setShowSignupForm(true)}
                  className="text-sm font-semibold px-5 py-2 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_3px_10px_rgba(14,150,176,0.35)] hover:-translate-y-0.5 hover:shadow-[0_5px_16px_rgba(14,150,176,0.40)] transition-all">
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signup form modal */}
      {showSignupForm && (
        <div className="fixed inset-0 bg-[#0D2B35]/50 backdrop-blur-[2px] flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(8,100,126,0.20)] max-w-lg w-full p-8 max-h-[90vh] overflow-y-auto">
            <h2 className="font-serif text-2xl text-[#0D2B35] mb-1">Complete your sign up</h2>
            <p className="text-sm text-[#5A8399] mb-5">
              Signing up for {selectedSessions.length} {selectedSessions.length === 1 ? "session" : "sessions"}
            </p>

            {/* Selected sessions summary */}
            <div className="mb-5 bg-[#E6F7FB] border border-[#0E96B0]/15 rounded-xl p-4 max-h-36 overflow-y-auto">
              <div className="text-[11px] font-semibold text-[#0E96B0] uppercase tracking-[0.6px] mb-2">Selected Sessions</div>
              <div className="space-y-1">
                {selectedSessions.map((sessionId) => {
                  const session = sessions.find((s) => s.id === sessionId);
                  if (!session) return null;
                  return (
                    <div key={sessionId} className="text-xs text-[#2E5566] flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-[#0E96B0] flex-shrink-0" />
                      {session.session_date
                        ? (() => {
                            const [y, m, d] = session.session_date.split('-').map(Number);
                            return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                          })()
                        : DAYS[session.day_of_week]}
                      {" · "}{formatTime(session.time)}{session.end_time ? ` – ${formatTime(session.end_time)}` : ""}
                    </div>
                  );
                })}
              </div>
            </div>

            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1.5">
                  Your Name <span className="text-red-400">*</span>
                </label>
                <input type="text" value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="John Doe"
                  className="w-full text-sm text-[#0D2B35] px-[16px] py-[12px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399]/70"
                  required />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1.5">
                  Email <span className="text-[#5A8399] font-normal">(optional)</span>
                </label>
                <input type="email" value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john@example.com"
                  className="w-full text-sm text-[#0D2B35] px-[16px] py-[12px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399]/70" />
                <p className="mt-1.5 text-[11px] text-[#5A8399] leading-snug">
                  {sessions.some((s: any) => s.session_date)
                    ? "Add your email to get a reminder the day before — we never share or sell your info."
                    : "Optional — for updates from the organizer. We never share or sell your info."}
                </p>
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1.5">
                  Phone <span className="text-[#5A8399] font-normal">(optional)</span>
                </label>
                <input type="tel" value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(555) 123-4567"
                  className="w-full text-sm text-[#0D2B35] px-[16px] py-[12px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399]/70" />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1.5">
                  Note <span className="text-[#5A8399] font-normal">(optional)</span>
                </label>
                <textarea value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  placeholder="Anything you'd like to share with the organizer"
                  rows={2}
                  className="w-full text-sm text-[#0D2B35] px-[16px] py-[12px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399]/70 resize-none" />
              </div>
              {allowGuests && guestNameFields}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button"
                  onClick={() => { setShowSignupForm(false); setError(""); }}
                  className="flex-1 text-sm font-semibold px-4 py-3 rounded-xl border-[1.5px] border-[#0E96B0]/30 text-[#2E5566] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all">
                  Back
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 text-sm font-semibold px-4 py-3 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.35)] disabled:opacity-60 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(14,150,176,0.45)] transition-all">
                  {submitting ? "Signing up…" : `Sign Up for ${selectedSessions.length} ${selectedSessions.length === 1 ? "Session" : "Sessions"}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="mt-auto flex-shrink-0 border-t border-[#0E96B0]/10 bg-white/90 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col items-center justify-center gap-4 text-center">
          <p className="text-sm text-[#5A8399] leading-relaxed text-center">
            Know someone who could use this? Share{" "}
            <a
              href={brand.siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#0E96B0] hover:text-[#08647E] underline decoration-[#0E96B0]/35 underline-offset-2"
            >
              {brand.siteHost}
            </a>{" "}
            with a friend.
          </p>
          <Link
            href="/"
            aria-label={`${brand.name} home`}
            className="inline-flex items-center gap-2.5 no-underline text-sm text-[#5A8399] hover:text-[#0E96B0] transition-colors group"
          >
            <Image
              src={brand.logoSrc}
              alt=""
              width={24}
              height={24}
              className="rounded-[6px] flex-shrink-0 opacity-90 group-hover:opacity-100"
            />
            <span>
              Made with{" "}
              <span className="text-red-500" aria-hidden>
                ♥
              </span>{" "}
              from Arizona
            </span>
          </Link>
        </div>
      </footer>
    </div>
  );
}
