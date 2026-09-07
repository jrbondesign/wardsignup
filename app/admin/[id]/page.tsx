"use client";

import { Fragment, use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import Link from "next/link";
import { createClientComponentClient } from "@/lib/auth";
import { Session, Signup, CampaignItemWithSignups } from "@/lib/types";
import { DigestScheduleLocalTime } from "@/components/DigestScheduleLocalTime";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Navigation from "@/components/Navigation";
import Toast from "@/components/Toast";
import { useBrand } from "@/components/BrandProvider";
import { campaignMatchesHostBrand } from "@/lib/campaign-brand-guard";
import { compareBySortOrder } from "@/lib/session-sort-order";
import OrgLogoButton from "@/components/OrgLogoButton";
import { organizerReportErrorHint } from "@/lib/organizer-report-ui";
import { formatTime } from "@/lib/utils";
import { downloadEventQr } from "@/lib/download-qr";

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

interface SessionWithSignups extends Session {
  signups: Signup[];
}

/**
 * Group a day's sessions by `section`, ordered by the organizer's explicit
 * sort_order (both section order and within-section). Mirrors the public
 * signup page so the admin roster shows each distinct class slot (Women's
 * Class, Men's Class 1, …) in the same order.
 */
function orderSessionsBySection(sessions: SessionWithSignups[]): SessionWithSignups[] {
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

/** "2026-06-25" → "Jun 25" (or with year). Local-time safe (no UTC shift). */
function formatSessionDate(iso: string, withYear = false): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export default function AdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const brand = useBrand();
  const isWardBrand = brand.id === "wardsignup";
  const router = useRouter();
  const posthog = usePostHog();

  const [event, setEvent] = useState<any>(null);
  const [eventType, setEventType] = useState<"spots" | "items" | "rsvp">("spots");
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
  const [allowGuests, setAllowGuests] = useState(true);
  const [showCapacityPublicly, setShowCapacityPublicly] = useState(true);
  const [sendingReport, setSendingReport] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);

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

  const handleRemoveSignup = async (signupId: string, memberName: string) => {
    if (!window.confirm(`Remove ${memberName} from this slot? This cannot be undone.`)) return;
    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/signups/${signupId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to remove signup");
      // Remove from local state without a full reload
      setSessions((prev) =>
        prev.map((s) => ({
          ...s,
          signups: s.signups.filter((su) => su.id !== signupId),
        }))
      );
    } catch (err: any) {
      alert(err.message || "Failed to remove signup. Please try again.");
    }
  };

  const handleDelete = async () => {
    if (!event) return;
    setDeleting(true);
    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/events/${eventId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${session?.access_token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to delete event");
      }
      router.push("/dashboard");
    } catch (error: any) {
      alert(error.message || "Failed to delete event");
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClientComponentClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { router.push("/login"); return; }

      const { data: eventData, error: eventError } = await supabase
        .from("campaigns").select("*").eq("id", eventId).single();

      if (eventError || !eventData) { setError("Event not found"); setLoading(false); return; }

      if (!campaignMatchesHostBrand((eventData as { brand_id?: string }).brand_id, brand)) {
        setError("Event not found");
        setLoading(false);
        return;
      }

      const hasAccess = (eventData as any).created_by === user.id ||
                        (eventData as any).user_email === user.email;
      if (!hasAccess) { router.push("/dashboard"); return; }

      setEvent(eventData);
      setCoverUrl((eventData as any).cover_image_url ?? null);

      const resolvedType: "spots" | "items" | "rsvp" =
        (eventData as any).event_type === "items" ? "items"
        : (eventData as any).event_type === "rsvp" ? "rsvp"
        : "spots";
      setEventType(resolvedType);

      if (resolvedType === "items") {
        const { data: itemsData } = await supabase
          .from("campaign_items")
          .select("*, item_signups(id, member_name, member_email, signup_note, quantity)")
          .eq("campaign_id", eventId)
          .order("sort_order")
          .order("created_at");
        setItems((itemsData || []) as CampaignItemWithSignups[]);

        const { data: customRows } = await supabase
          .from("item_signups")
          .select("id, member_name, member_email, custom_label, signup_note, quantity")
          .eq("campaign_id", eventId)
          .is("item_id", null)
          .order("signed_up_at");
        setCustomSignups((customRows ?? []) as never);
      } else {
        const { data: sessionsData } = await supabase
          .from("sessions").select("*, signups(*)")
          .eq("campaign_id", eventId).order("session_date", { ascending: true, nullsFirst: false }).order("day_of_week").order("time");
        setSessions(sessionsData || []);
      }
      setShareableLink(`${window.location.origin}/event/${eventId}`);
      setDigestEnabled(Boolean((eventData as any).organizer_digest_enabled));
      setInstantEnabled(Boolean((eventData as any).organizer_instant_notify_enabled));
      setShowSignupsPublicly(Boolean((eventData as any).show_signups_publicly));
      const ag = (eventData as any).allow_guests;
      setAllowGuests(ag == null ? true : Boolean(ag));
      const scp = (eventData as any).show_capacity_publicly;
      setShowCapacityPublicly(scp == null ? true : Boolean(scp));

      // Load org logo (Ministry brand only)
      if (brand.id === "ministrysignup") {
        const { data: profile } = await supabase
          .from("organizer_profiles")
          .select("logo_url")
          .eq("user_id", user.id)
          .eq("brand_id", "ministrysignup")
          .maybeSingle();
        setLogoUrl((profile as any)?.logo_url ?? null);
      }

      setLoading(false);
    };
    loadData();
  }, [router, eventId, brand.id]);

  const patchOrganizerEmailPrefs = async (partial: {
    organizer_digest_enabled?: boolean;
    organizer_instant_notify_enabled?: boolean;
    show_signups_publicly?: boolean;
    allow_guests?: boolean;
    show_capacity_publicly?: boolean;
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
      throw new Error(data.error || "Failed to save email settings");
    }
    setEvent((prev: any) => (prev ? { ...prev, ...partial } : prev));
  };

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = async () => {
      if (img.width / img.height < 0.9) {
        alert("Please upload a landscape image (wider than tall). 2:1 ratio recommended, 800×400 px minimum.");
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

  // Group by session_date when sessions have specific dates (missionary dinners, RSVP events),
  // otherwise group by day-of-week name (recurring spots without specific dates).
  const hasSessionDates = sessions.some((s) => s.session_date);
  const groupedSessions = sessions.reduce((acc, session) => {
    const key = hasSessionDates && session.session_date
      ? session.session_date  // ISO date "YYYY-MM-DD" — sorts chronologically
      : DAYS[session.day_of_week];
    if (!acc[key]) acc[key] = [];
    acc[key].push(session);
    return acc;
  }, {} as Record<string, SessionWithSignups[]>);

  const totalCapacity = sessions.reduce((sum, s) => sum + s.capacity, 0);
  const totalSignups = sessions.reduce((sum, s) => sum + (s.signups?.length || 0), 0);
  // Capacity is measured in signups (households), not total people including guests
  const totalPeople = totalSignups;
  const fillPct = totalCapacity > 0 ? Math.round((totalSignups / totalCapacity) * 100) : 0;

  return (
    <>
      <Toast
        message={toastMessage}
        show={showToast}
        onClose={() => setShowToast(false)}
        duration={toastMessage.includes("Report sent") ? 8000 : 3000}
      />
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

          {/* Event header card */}
          <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden mb-6">
            {/* Cover image — Ministry brand only */}
            {brand.id === "ministrysignup" && (
              <div className="relative">
                <label className="cursor-pointer group block">
                  <div className="w-full aspect-[2/1] relative overflow-hidden bg-[#F4FAFB] flex items-center justify-center">
                    {coverUploading ? (
                      <LoadingSpinner size="lg" />
                    ) : (coverPreview || coverUrl) ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
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
            <div className="p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
              <div className="flex-1 min-w-0 w-full">
                <div className="flex items-start gap-3">
                  {/* Org logo — Ministry brand only */}
                  {brand.id === "ministrysignup" && (
                    <OrgLogoButton initialUrl={logoUrl} size="md" />
                  )}
                  <h1 className="font-serif text-[clamp(24px,3.5vw,36px)] text-[#0D2B35] tracking-[-0.4px] leading-tight flex-1 min-w-0">
                    {event.name}
                  </h1>
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
                </div>
                {event.description && (
                  <p className="text-sm text-[#5A8399] mt-2 leading-relaxed whitespace-pre-wrap">
                    {event.description}
                  </p>
                )}
              </div>

              {/* sm+: inline actions */}
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

            {/* Stats */}
            {(eventType === "spots" || eventType === "rsvp") ? (
              <>
                {/* unlimited (capacity ≥ 999): just show attendee count, hide the sentinel */}
                {totalCapacity >= 999 ? (
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="bg-[#E6F7FB] rounded-xl p-4 flex flex-col items-center">
                      <div className="h-8 flex items-center justify-center text-[10px] font-semibold tracking-[0.3px] uppercase text-[#0E96B0] whitespace-nowrap">Registered</div>
                      <div className="text-3xl font-semibold text-[#054F64]">{totalPeople}</div>
                      {totalPeople !== totalSignups && (
                        <div className="text-[10px] text-[#5A8399] mt-0.5">{totalSignups} {totalSignups === 1 ? "signup" : "signups"}</div>
                      )}
                    </div>
                    <div className="bg-[#edfaf4] rounded-xl p-4 flex flex-col items-center">
                      <div className="h-8 flex items-center justify-center text-[10px] font-semibold tracking-[0.3px] uppercase text-[#1D9E75] whitespace-nowrap">Capacity</div>
                      <div className="text-2xl font-semibold text-[#0F6E56]">Unlimited</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-5">
                      <div className="bg-[#E6F7FB] rounded-xl p-4 flex flex-col items-center">
                        <div className="h-8 flex items-center justify-center text-[10px] font-semibold tracking-[0.3px] uppercase text-[#0E96B0] whitespace-nowrap">Total spots</div>
                        <div className="text-3xl font-semibold text-[#054F64]">{totalCapacity}</div>
                      </div>
                      <div className="bg-[#edfaf4] rounded-xl p-4 flex flex-col items-center">
                        <div className="h-8 flex items-center justify-center text-[10px] font-semibold tracking-[0.3px] uppercase text-[#1D9E75] whitespace-nowrap">Total People</div>
                        <div className="text-3xl font-semibold text-[#0F6E56]">{totalPeople}</div>
                        {totalPeople !== totalSignups && (
                          <div className="text-[10px] text-[#5A8399] mt-0.5">{totalSignups} {totalSignups === 1 ? "registration" : "registrations"}</div>
                        )}
                      </div>
                      <div className="rounded-xl p-4 flex flex-col items-center" style={{ background: (totalCapacity - totalPeople) === 0 ? "#fef2f2" : "#fdf6ec" }}>
                        <div className="h-8 flex items-center justify-center text-[10px] font-semibold tracking-[0.3px] uppercase whitespace-nowrap"
                             style={{ color: (totalCapacity - totalPeople) === 0 ? "#ef4444" : "#d97706" }}>Remaining</div>
                        <div className="text-3xl font-semibold"
                             style={{ color: (totalCapacity - totalPeople) === 0 ? "#dc2626" : "#b45309" }}>{Math.max(0, totalCapacity - totalPeople)}</div>
                      </div>
                    </div>
                    <div className="h-1.5 bg-[#0E96B0]/10 rounded-full overflow-hidden mb-1.5">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#22C8D8] to-[#08647E] transition-all"
                           style={{ width: `${Math.min(100, fillPct)}%` }} />
                    </div>
                    <div className="text-[11px] text-[#5A8399] text-right mb-5">{Math.min(100, fillPct)}% filled</div>
                  </>
                )}
              </>
            ) : (() => {
              const totalItems = items.length;
              const itemClaimed = (it: { item_signups?: { quantity?: number }[] }) =>
                (it.item_signups ?? []).reduce((s, r) => s + (r.quantity ?? 1), 0);
              const totalClaimed = items.reduce((sum, it) => sum + itemClaimed(it), 0);
              const unclaimed = items.filter((it) => itemClaimed(it) === 0).length;
              return (
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="bg-[#E6F7FB] rounded-xl p-4 flex flex-col items-center">
                    <div className="h-8 flex items-center justify-center text-[10px] font-semibold tracking-[0.3px] uppercase text-[#0E96B0] whitespace-nowrap">Items</div>
                    <div className="text-3xl font-semibold text-[#054F64]">{totalItems}</div>
                  </div>
                  <div className="bg-[#edfaf4] rounded-xl p-4 flex flex-col items-center">
                    <div className="h-8 flex items-center justify-center text-[10px] font-semibold tracking-[0.3px] uppercase text-[#1D9E75] whitespace-nowrap">Claimed</div>
                    <div className="text-3xl font-semibold text-[#0F6E56]">{totalClaimed}</div>
                  </div>
                  <div className="rounded-xl p-4 flex flex-col items-center" style={{ background: unclaimed === 0 ? "#edfaf4" : "#fdf6ec" }}>
                    <div className="h-8 flex items-center justify-center text-[10px] font-semibold tracking-[0.3px] uppercase whitespace-nowrap"
                         style={{ color: unclaimed === 0 ? "#1D9E75" : "#d97706" }}>Unclaimed</div>
                    <div className="text-3xl font-semibold"
                         style={{ color: unclaimed === 0 ? "#0F6E56" : "#b45309" }}>{unclaimed}</div>
                  </div>
                </div>
              );
            })()}

            {/* Email updates — compact, directly above signup link */}
            <div className="mb-4 rounded-xl border border-[#0E96B0]/18 bg-[#F8FCFD] px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 gap-y-1 mb-2">
                <h3 className="text-sm font-semibold text-[#0D2B35]">Email updates</h3>
                <button
                  type="button"
                  disabled={sendingReport}
                  onClick={sendOrganizerReportNow}
                  className="text-xs font-semibold text-[#0E96B0] hover:text-[#08647E] disabled:opacity-50 disabled:cursor-not-allowed underline-offset-2 hover:underline"
                >
                  {sendingReport ? "Sending…" : "Send report now"}
                </button>
              </div>
              <p className="text-[11px] text-[#5A8399] leading-snug mb-1.5">
                Metrics and roster details. The daily digest runs once per day at{" "}
                <span className="text-[#2E5566] font-medium">14:00 UTC</span> (
                <DigestScheduleLocalTime /> in your time zone). It only sends when something changed
                since the last email.
              </p>
              <p className="text-[11px] text-[#5A8399] leading-snug mb-2.5">
                Participants who provided an email address automatically receive a reminder ~24 hours before their dated session.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2">
                <label className="flex items-center gap-2 cursor-pointer group min-w-0">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 shrink-0 rounded border-[#0E96B0]/40 text-[#0E96B0] focus:ring-[#0E96B0]"
                    checked={digestEnabled}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      setDigestEnabled(next);
                      try {
                        await patchOrganizerEmailPrefs({ organizer_digest_enabled: next });
                      } catch (err: unknown) {
                        setDigestEnabled(!next);
                        alert(err instanceof Error ? err.message : "Could not save");
                      }
                    }}
                  />
                  <span className="text-xs text-[#2E5566] group-hover:text-[#0D2B35]">
                    <span className="font-medium">Daily digest</span>
                    <span className="text-[#5A8399] font-normal">
                      {" · "}
                      <DigestScheduleLocalTime />
                      {" · if something changed"}
                    </span>
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group min-w-0">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 shrink-0 rounded border-[#0E96B0]/40 text-[#0E96B0] focus:ring-[#0E96B0]"
                    checked={instantEnabled}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      setInstantEnabled(next);
                      try {
                        await patchOrganizerEmailPrefs({ organizer_instant_notify_enabled: next });
                      } catch (err: unknown) {
                        setInstantEnabled(!next);
                        alert(err instanceof Error ? err.message : "Could not save");
                      }
                    }}
                  />
                  <span className="text-xs text-[#2E5566] group-hover:text-[#0D2B35]">
                    <span className="font-medium">Faster alerts</span>
                    <span className="text-[#5A8399] font-normal">
                      {" "}
                      · about every 30 minutes when there are new signups
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-[#0E96B0]/18 bg-[#F8FCFD] px-4 py-3">
              <h3 className="text-sm font-semibold text-[#0D2B35] mb-1">Signup visibility</h3>
              <p className="text-[11px] text-[#5A8399] leading-snug mb-2.5">
                When on, visitors can see who else has signed up (name and note).
              </p>
              <label className="flex items-center gap-2 cursor-pointer group min-w-0">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 shrink-0 rounded border-[#0E96B0]/40 text-[#0E96B0] focus:ring-[#0E96B0]"
                  checked={showSignupsPublicly}
                  onChange={async (e) => {
                    const next = e.target.checked;
                    setShowSignupsPublicly(next);
                    try {
                      await patchOrganizerEmailPrefs({ show_signups_publicly: next });
                    } catch (err: unknown) {
                      setShowSignupsPublicly(!next);
                      alert(err instanceof Error ? err.message : "Could not save");
                    }
                  }}
                />
                <span className="text-xs text-[#2E5566] group-hover:text-[#0D2B35]">
                  <span className="font-medium">Show who signed up</span>
                  <span className="text-[#5A8399] font-normal"> · visible on the public signup page</span>
                </span>
              </label>
            </div>


            {/* Allow guests + show capacity — for spots/rsvp type events */}
            {eventType !== "items" && (
              <div className="mb-4 rounded-xl border border-[#0E96B0]/18 bg-[#F8FCFD] px-4 py-3">
                <h3 className="text-sm font-semibold text-[#0D2B35] mb-1">Registration options</h3>
                <p className="text-[11px] text-[#5A8399] leading-snug mb-2.5">
                  Control what participants can see and do on the public signup page.
                </p>
                <div className="space-y-2.5">
                  <label className="flex items-center gap-2 cursor-pointer group min-w-0">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 shrink-0 rounded border-[#0E96B0]/40 text-[#0E96B0] focus:ring-[#0E96B0]"
                      checked={allowGuests}
                      onChange={async (e) => {
                        const next = e.target.checked;
                        setAllowGuests(next);
                        try {
                          await patchOrganizerEmailPrefs({ allow_guests: next });
                        } catch (err: unknown) {
                          setAllowGuests(!next);
                          alert(err instanceof Error ? err.message : "Could not save");
                        }
                      }}
                    />
                    <span className="text-xs text-[#2E5566] group-hover:text-[#0D2B35]">
                      <span className="font-medium">Allow guests</span>
                      <span className="text-[#5A8399] font-normal"> · participants can register additional people by name</span>
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group min-w-0">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 shrink-0 rounded border-[#0E96B0]/40 text-[#0E96B0] focus:ring-[#0E96B0]"
                      checked={showCapacityPublicly}
                      onChange={async (e) => {
                        const next = e.target.checked;
                        setShowCapacityPublicly(next);
                        try {
                          await patchOrganizerEmailPrefs({ show_capacity_publicly: next });
                        } catch (err: unknown) {
                          setShowCapacityPublicly(!next);
                          alert(err instanceof Error ? err.message : "Could not save");
                        }
                      }}
                    />
                    <span className="text-xs text-[#2E5566] group-hover:text-[#0D2B35]">
                      <span className="font-medium">Show spots remaining</span>
                      <span className="text-[#5A8399] font-normal"> · visible on the public signup page</span>
                    </span>
                  </label>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-[#0E96B0]/18 bg-[#F8FCFD] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#0D2B35] mb-0.5">Signup link</div>
                <div className="text-[11px] text-[#5A8399] leading-snug">
                  {isWardBrand
                    ? "Copy and share with ward members — no account required to sign up"
                    : "Copy and share with your group — no account required to sign up"}
                </div>
              </div>
              <div className="flex gap-2 sm:flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(shareableLink);
                    posthog?.capture("event_shared", { event_id: eventId });
                    setToastMessage("Link copied to clipboard!");
                    setShowToast(true);
                  }}
                  className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border-[1.5px] border-[#0E96B0]/35 text-[#08647E] bg-white/60 hover:border-[#0E96B0] hover:bg-white transition-all"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  Copy Link
                </button>
              </div>
            </div>
            </div>{/* end p-7 */}
          </div>

          {/* Items list — items type */}
          {eventType === "items" && (
            <div className="space-y-3">
              {items.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-10 text-center">
                  <p className="text-sm text-[#5A8399]">No items added yet.</p>
                </div>
              ) : (
                items.map((item) => {
                  const claimed = (item.item_signups ?? []).reduce((s, r) => s + ((r as { quantity?: number }).quantity ?? 1), 0);
                  const limit = item.item_limit;
                  const isFull = limit !== null && claimed >= limit;
                  return (
                    <div key={item.id} className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden">
                      <div className="px-5 py-4 border-b border-[#0E96B0]/8 bg-gradient-to-r from-[#F4FAFB] to-white flex items-center justify-between gap-3">
                        <div className="font-semibold text-[15px] text-[#0D2B35] leading-snug">{item.label}</div>
                        <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
                          isFull ? "bg-[#edfaf4] text-[#1D9E75]" : claimed === 0 ? "bg-[#F4FAFB] text-[#5A8399]" : "bg-[#fdf6ec] text-[#d97706]"
                        }`}>
                          {claimed}{limit !== null ? `/${limit}` : ""} claimed
                        </span>
                      </div>
                      {claimed === 0 ? (
                        <div className="px-5 py-4 text-xs text-[#5A8399] italic">No one yet</div>
                      ) : (
                        <div className="px-5 py-3 space-y-1.5">
                          {item.item_signups.map((sig) => (
                            <div key={sig.id} className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded-full bg-[#E6F7FB] flex items-center justify-center flex-shrink-0">
                                <svg viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                                  <polyline points="20 6 9 17 4 12"/>
                                </svg>
                              </div>
                              <div className="min-w-0">
                                <span className="text-sm text-[#0D2B35] font-medium">{sig.member_name}</span>
                                {((sig as { quantity?: number }).quantity ?? 1) > 1 && (
                                  <span className="text-xs font-semibold text-[#08647E] bg-[#E6F7FB] border border-[rgba(14,150,176,0.22)] rounded-full px-2 py-0.5 ml-2">
                                    ×{(sig as { quantity?: number }).quantity}
                                  </span>
                                )}
                                {sig.member_email && <span className="text-xs text-[#5A8399] ml-2">{sig.member_email}</span>}
                                {sig.signup_note && (
                                  <p className="text-xs text-[#5A8399] mt-0.5 leading-snug">{sig.signup_note}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {customSignups.length > 0 && (
                <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden">
                  <div className="px-5 py-4 border-b border-[#0E96B0]/8 bg-gradient-to-r from-[#F4FAFB] to-white">
                    <div className="font-semibold text-[15px] text-[#0D2B35]">Also bringing (write-ins)</div>
                    <div className="text-xs text-[#5A8399] mt-0.5">Items attendees added that weren&apos;t on your list.</div>
                  </div>
                  <div className="px-5 py-3 space-y-1.5">
                    {customSignups.map((sig) => (
                      <div key={sig.id} className="flex items-start gap-2">
                        <div className="w-5 h-5 rounded-full bg-[#FFF4E5] flex items-center justify-center flex-shrink-0 mt-0.5">
                          <svg viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm text-[#0D2B35] font-medium">{sig.custom_label}</span>
                          <span className="text-xs text-[#5A8399]"> · {sig.member_name}</span>
                          {sig.member_email && <span className="text-xs text-[#5A8399] ml-1">({sig.member_email})</span>}
                          {sig.signup_note && <p className="text-xs text-[#5A8399] mt-0.5 leading-snug">{sig.signup_note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sessions — spots/rsvp type */}
          {(eventType === "spots" || eventType === "rsvp") && Object.keys(groupedSessions).length === 0 ? (
            <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-10 text-center">
              <p className="text-sm text-[#5A8399]">No sessions created yet.</p>
            </div>
          ) : (eventType === "spots" || eventType === "rsvp") && (
            <div className="space-y-4">
              {Object.entries(groupedSessions).map(([day, daySessions]) => {
                const orderedSessions = orderSessionsBySection(daySessions);

                return (
                  <div key={day} className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden">
                    {/* Day header */}
                    <div className="px-6 py-4 border-b border-[#0E96B0]/8 bg-gradient-to-r from-[#F4FAFB] to-white">
                      <h2 className="font-serif text-xl text-[#0D2B35]">
                        {hasSessionDates && /^\d{4}-\d{2}-\d{2}$/.test(day)
                          ? (() => { const [y,m,d2] = day.split("-").map(Number); return new Date(y, m-1, d2).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }); })()
                          : day}
                      </h2>
                    </div>

                    <div className="p-6 space-y-3">
                      {orderedSessions.map((session, sIdx, sArr) => {
                        const filled = session.signups?.length || 0;
                        const isFull = filled >= session.capacity;
                        const sectionKey = (session.section ?? "").trim();
                        const prevKey = sIdx > 0 ? (sArr[sIdx - 1].section ?? "").trim() : "";
                        const showHeader = sectionKey !== "" && sectionKey !== prevKey;

                        return (
                          <Fragment key={session.id}>
                            {showHeader && (
                              <h3 className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[#5A8399] px-1 pt-3 first:pt-0">
                                {sectionKey}
                              </h3>
                            )}
                            <div className="border border-[#0E96B0]/12 rounded-xl p-4">
                              <div className="flex items-start justify-between gap-2 mb-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-[#0D2B35]">
                                    {session.label || (
                                      <>
                                        {formatTime(session.time)}
                                        {session.end_time && ` – ${formatTime(session.end_time)}`}
                                      </>
                                    )}
                                    {session.location && (
                                      <span className="text-[#5A8399] font-normal"> · {session.location}</span>
                                    )}
                                  </div>
                                  {session.label && (
                                    <div className="text-xs text-[#5A8399] mt-0.5">
                                      {formatTime(session.time)}
                                      {session.end_time && ` – ${formatTime(session.end_time)}`}
                                    </div>
                                  )}
                                  {session.notes && (
                                    <div className="text-xs text-[#5A8399] mt-0.5">{session.notes}</div>
                                  )}
                                </div>
                                <span className={`flex-shrink-0 whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full ${
                                  isFull
                                    ? "bg-[#edfaf4] text-[#1D9E75]"
                                    : "bg-[#fdf6ec] text-[#d97706]"
                                }`}>
                                  {session.capacity >= 999
                                    ? `${filled} signed up`
                                    : `${filled}/${session.capacity} filled`}
                                </span>
                              </div>

                              {session.session_date && (
                                <div className="mb-3">
                                  <span className="inline-block bg-[#E6F7FB] text-[#0E96B0] px-2.5 py-1 rounded-lg text-xs font-medium">
                                    {formatSessionDate(session.session_date, true)}
                                  </span>
                                </div>
                              )}

                              {/* Signups */}
                              <div className="mt-3 pt-3 border-t border-[#0E96B0]/8">
                                <div className="text-xs font-semibold text-[#2E5566] mb-2 uppercase tracking-[0.5px]">Signed Up</div>
                                {session.signups?.length ? (
                                  <div className="space-y-1.5">
                                    {session.signups.map((signup) => (
                                      <div key={signup.id} className="bg-[#F4FAFB] border border-[#0E96B0]/8 rounded-lg px-3 py-2.5">
                                        <div className="flex items-start gap-2">
                                          <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-[#0D2B35]">{signup.member_name}</div>
                                            {/* Guest names indented below registrant */}
                                            {(signup as any).guest_names?.length > 0 && (
                                              <div className="mt-1 space-y-0.5">
                                                {((signup as any).guest_names as string[]).map((gn: string, gi: number) => (
                                                  <div key={gi} className="text-xs text-[#5A8399] flex items-center gap-1.5 pl-2">
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 text-[#0E96B0]/60 flex-shrink-0">
                                                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                                                    </svg>
                                                    {gn}
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                            {(signup.member_email || signup.member_phone) && (
                                              <div className="text-xs text-[#5A8399] mt-0.5 space-y-0.5">
                                                {signup.member_email && <div>{signup.member_email}</div>}
                                                {signup.member_phone && <div>{signup.member_phone}</div>}
                                              </div>
                                            )}
                                            {(signup as any).signup_note && (
                                              <p className="text-xs text-[#5A8399] mt-0.5 leading-snug italic">"{(signup as any).signup_note}"</p>
                                            )}
                                          </div>
                                        </div>
                                        <button
                                          onClick={() => handleRemoveSignup(signup.id, signup.member_name)}
                                          className="mt-2 text-[11px] font-medium text-red-500 hover:text-red-700 hover:underline transition-colors"
                                        >
                                          Remove signup
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-xs text-[#5A8399] italic">No signups yet</div>
                                )}
                              </div>
                            </div>
                          </Fragment>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {showDeleteModal && (
          <div className="fixed inset-0 bg-[#0D2B35]/50 backdrop-blur-[2px] flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(8,100,126,0.18)] max-w-md w-full p-8">
              <h2 className="font-serif text-2xl text-[#0D2B35] mb-3">Delete Event?</h2>
              <p className="text-sm text-[#5A8399] leading-relaxed mb-6">
                Are you sure you want to delete <strong className="text-[#0D2B35] font-semibold">{event.name}</strong>? This will also delete all sessions, signups, and invitations. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteModal(false)} disabled={deleting}
                  className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/30 text-[#2E5566] hover:border-[#0E96B0] hover:bg-[#E6F7FB] disabled:opacity-50 transition-all">
                  Cancel
                </button>
                <button onClick={handleDelete} disabled={deleting}
                  className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white transition-colors">
                  {deleting ? "Deleting…" : "Delete Event"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
