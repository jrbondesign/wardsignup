"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { createClientComponentClient } from "@/lib/auth";
import { Event } from "@/lib/types";
import Link from "next/link";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Navigation from "@/components/Navigation";
import Toast from "@/components/Toast";
import { useBrand } from "@/components/BrandProvider";
import OrgLogoButton from "@/components/OrgLogoButton";
import OrgNameModal from "@/components/OrgNameModal";
import OrgSwitcher from "@/components/OrgSwitcher";
import { getCurrentOrganization } from "@/lib/organizations";
import ConnectToClaudeCard from "@/components/ConnectToClaudeCard";
import { getMaxCampaignsForOrg, getMaxCampaignsPerUser, isUnlimitedEventsUser } from "@/lib/limits";
import { EVENT_TEMPLATES, TEMPLATES_INITIAL_VISIBLE } from "@/lib/event-template-data";
import { downloadEventQr } from "@/lib/download-qr";
import { diffDays, earliestYmd } from "@/lib/date-shift";

interface DeleteModalProps {
  eventId: string;
  eventName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteModal({ eventId, eventName, onConfirm, onCancel }: DeleteModalProps) {
  return (
    <div className="fixed inset-0 bg-[#0D2B35]/50 backdrop-blur-[2px] flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(8,100,126,0.18)] max-w-md w-full p-8">
        <h2 className="font-serif text-2xl text-[#0D2B35] mb-3">Delete Event?</h2>
        <p className="text-sm text-[#5A8399] leading-relaxed mb-6">
          Are you sure you want to delete <strong className="text-[#0D2B35] font-semibold">{eventName}</strong>? This will also delete all slots, signups, and invitations. This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/30 text-[#2E5566] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors"
          >
            Delete Event
          </button>
        </div>
      </div>
    </div>
  );
}

interface DuplicateModalProps {
  eventName: string;
  anchorDate: string | null;
  duplicating: boolean;
  onConfirm: (name: string, newStartDate: string) => void;
  onCancel: () => void;
}

function DuplicateModal({ eventName, anchorDate, duplicating, onConfirm, onCancel }: DuplicateModalProps) {
  const [name, setName] = useState(`Copy of ${eventName}`);
  const [newStart, setNewStart] = useState("");

  const shiftDays =
    anchorDate && /^\d{4}-\d{2}-\d{2}$/.test(newStart)
      ? (diffDays(anchorDate, newStart) ?? 0)
      : 0;
  const showShiftHint = anchorDate && newStart && shiftDays !== 0;

  return (
    <div className="fixed inset-0 bg-[#0D2B35]/50 backdrop-blur-[2px] flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(8,100,126,0.18)] max-w-md w-full p-8">
        <h2 className="font-serif text-2xl text-[#0D2B35] mb-2">Duplicate Event</h2>
        <p className="text-sm text-[#5A8399] leading-relaxed mb-5">
          Creates a copy of <strong className="text-[#0D2B35] font-semibold">{eventName}</strong> with all its
          spots and items — but no signups. You can fine-tune everything afterward.
        </p>

        <label className="block text-xs font-semibold text-[#2E5566] mb-1.5">New event name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={duplicating}
          className="w-full text-sm px-3 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/25 focus:border-[#0E96B0] focus:outline-none mb-5 disabled:opacity-60"
        />

        {anchorDate && (
          <>
            <label className="block text-xs font-semibold text-[#2E5566] mb-1.5">
              New start date <span className="font-normal text-[#5A8399]">(optional)</span>
            </label>
            <input
              type="date"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              disabled={duplicating}
              className="w-full text-sm px-3 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/25 focus:border-[#0E96B0] focus:outline-none disabled:opacity-60"
            />
            <p className="text-[11px] text-[#5A8399] mt-1.5 leading-snug">
              {showShiftHint
                ? `All dates shift by ${shiftDays > 0 ? "+" : ""}${shiftDays} day${Math.abs(shiftDays) === 1 ? "" : "s"} (original starts ${anchorDate}).`
                : `Leave blank to keep the same dates. The original starts ${anchorDate}.`}
            </p>
          </>
        )}

        <div className="flex gap-3 mt-7">
          <button
            onClick={onCancel}
            disabled={duplicating}
            className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/30 text-[#2E5566] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(name.trim(), newStart)}
            disabled={duplicating || !name.trim()}
            className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.35)] hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {duplicating ? "Duplicating…" : "Duplicate"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const brand = useBrand();
  const isWardBrand = brand.id === "wardsignup";
  const router = useRouter();
  const posthog = usePostHog();
  const [user, setUser] = useState<any>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [duplicateModal, setDuplicateModal] = useState<{ id: string; name: string; anchorDate: string | null } | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [orgNeedsNaming, setOrgNeedsNaming] = useState<{ id: string; name: string } | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);

  const maxEvents = getMaxCampaignsForOrg(orgName) ?? getMaxCampaignsPerUser();
  const isUnlimited = isUnlimitedEventsUser(user?.email);
  const atLimit = !isUnlimited && events.length >= maxEvents;

  const handleDelete = async () => {
    if (!deleteModal) return;

    setDeleting(true);
    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`/api/events/${deleteModal.id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${session?.access_token}`,
        },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to delete event");
      }

      posthog?.capture("event_deleted", { event_id: deleteModal.id, event_name: deleteModal.name });
      setEvents((prev) => prev.filter((e) => e.id !== deleteModal.id));
      setDeleteModal(null);
    } catch (error: any) {
      alert(error.message || "Failed to delete event");
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicate = async (name: string, newStartDate: string) => {
    if (!duplicateModal) return;

    setDuplicating(true);
    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`/api/events/${duplicateModal.id}/duplicate`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, new_start_date: newStartDate || undefined }),
      });

      const bodyJson = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(bodyJson?.error || "Failed to duplicate event");
      }

      posthog?.capture("event_duplicated", {
        source_event_id: duplicateModal.id,
        event_id: bodyJson?.event?.id,
      });
      setDuplicateModal(null);
      // Land on the edit page so the organizer can review and fine-tune dates.
      router.push(`/edit/${bodyJson.event.id}`);
    } catch (error: any) {
      alert(error.message || "Failed to duplicate event");
      setDuplicating(false);
    }
  };

  useEffect(() => {
    const loadUserAndEvents = async () => {
      const supabase = createClientComponentClient();

      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

      if (authError || !authUser) {
        router.push("/login");
        return;
      }

      setUser(authUser);
      posthog?.identify(authUser.id, { email: authUser.email });

      // Honor the user's saved org selection (organizer_profiles.selected_org_id) so
      // multi-org users land on the org they picked. If it was backfilled
      // (needs_naming = true), a blocking modal asks them to rename before doing
      // anything else.
      const org = await getCurrentOrganization(supabase, authUser, brand.id);
      if (org?.needs_naming) {
        setOrgNeedsNaming({ id: org.id, name: org.name });
      } else if (org?.name) {
        setOrgName(org.name);
      }

      // Load org logo (Ministry brand only)
      if (brand.id === "ministrysignup") {
        const { data: profile } = await supabase
          .from("organizer_profiles")
          .select("logo_url")
          .eq("user_id", authUser.id)
          .eq("brand_id", "ministrysignup")
          .maybeSingle();
        setLogoUrl((profile as any)?.logo_url ?? null);
      }

      // Scope campaigns to the active org so multi-org users only see the events for
      // whichever org they selected. RLS already restricts visibility to orgs they
      // belong to; this narrows further to the chosen one.
      let campaignsQuery = supabase
        .from("campaigns")
        .select(`
          *,
          sessions (
            id,
            capacity,
            session_date,
            signups (id)
          ),
          campaign_items (
            id,
            item_signups (id)
          )
        `)
        .eq("brand_id", brand.id)
        .order("created_at", { ascending: false });
      if (org) campaignsQuery = campaignsQuery.eq("organization_id", org.id);
      const { data: campaigns, error: fetchError } = await campaignsQuery;

      if (fetchError) {
        setError("Failed to load events");
        console.error(fetchError);
      } else {
        setEvents(campaigns || []);
      }

      setLoading(false);
    };

    loadUserAndEvents();
  }, [router, brand.id]);

  useEffect(() => {
    const handleClickOutside = () => setOpenDropdown(null);
    if (openDropdown) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [openDropdown]);

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#F4FAFB]">
        <LoadingSpinner size="xl" className="mb-4" />
        <p className="text-sm text-[#5A8399]">Loading your events…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#F4FAFB]">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-[0_8px_32px_rgba(8,100,126,0.10)] p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-red-500">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h1 className="font-serif text-2xl text-[#0D2B35] mb-3">Something went wrong</h1>
          <p className="text-sm text-[#5A8399] mb-6">{error}</p>
          <button
            onClick={() => router.push("/login")}
            className="text-sm font-semibold px-6 py-2.5 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.35)] hover:-translate-y-0.5 transition-all"
          >
            Back to Login
          </button>
        </div>
      </main>
    );
  }

  const copyEventLink = (eventId: string) => {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/event/${eventId}`;
    void navigator.clipboard.writeText(url);
    posthog?.capture("event_link_copied", { event_id: eventId });
    setCopyToast(true);
    setOpenDropdown(null);
  };

  return (
    <>
      <Toast message="Link copied to clipboard!" show={copyToast} onClose={() => setCopyToast(false)} />
      <Navigation />
      <main className="min-h-screen bg-[#F4FAFB] px-6 py-10 md:px-10">
        <div className="max-w-6xl mx-auto">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-1">
                {/* Org logo — Ministry brand only */}
                {brand.id === "ministrysignup" && (
                  <OrgLogoButton initialUrl={logoUrl} size="sm" />
                )}
                <h1 className="font-serif text-[clamp(28px,4vw,40px)] text-[#0D2B35] tracking-[-0.5px] leading-tight">
                  {orgName ?? "My Events"}
                </h1>
              </div>
              <p className="text-sm text-[#5A8399] flex items-center gap-2">
                <span>{isWardBrand ? "Manage your ward signups" : "Manage your ministry signups"}</span>
                <OrgSwitcher />
              </p>
              <p className="text-xs text-[#5A8399] mt-2 max-w-xl leading-relaxed">
                {isUnlimited
                  ? isWardBrand
                    ? "Share links with your ward—people who sign up don’t need an account."
                    : "Share links with your group—people who sign up don’t need an account."
                  : <>
                      Free beta: up to {maxEvents} events per account.{" "}
                      {atLimit
                        ? "Delete an event below to create a new one."
                        : isWardBrand
                          ? "Share links with your ward—people who sign up don’t need an account."
                          : "Share links with your group—people who sign up don’t need an account."}
                    </>
                }
              </p>
              {!isUnlimited && events.length > 0 && (
                <div className="mt-3 inline-flex items-center gap-2 text-[13px] font-semibold text-[#0D2B35] tabular-nums bg-[#E6F7FB] border border-[#0E96B0]/20 rounded-full px-3 py-1">
                  <span>{events.length}</span>
                  <span className="text-[#5A8399] font-normal">/</span>
                  <span className="text-[#5A8399] font-normal">{maxEvents}</span>
                  <span className="text-[#5A8399] font-normal font-sans font-medium">events</span>
                </div>
              )}
            </div>
            {/* "New Event" — secondary action, shown only when events exist */}
            {events.length > 0 && (
              atLimit ? (
                <div className="flex-shrink-0 text-right max-w-xs">
                  <span
                    className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-full bg-[#E8ECEE] text-[#7A9399] cursor-not-allowed"
                    title="Event limit reached"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    New Event
                  </span>
                  <p className="text-[11px] text-[#5A8399] mt-2 leading-snug">
                    You&apos;ve reached the free beta limit. Delete an event to create another.
                  </p>
                </div>
              ) : (
                <Link
                  href="/create"
                  className="flex-shrink-0 inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-full border-[1.5px] border-[#0E96B0]/35 text-[#08647E] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all no-underline"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  New Event
                </Link>
              )
            )}
          </div>

          {/* Template quick-launch — ward brand only, when not at limit */}
          {isWardBrand && !atLimit && (
            <div className="mb-8">
              <div className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.6px] mb-3">
                Quick-start templates
              </div>
              {/* Horizontal scrollable chip row — mobile; wrapping row — desktop */}
              <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible scrollbar-hide">
                {(showAllTemplates ? EVENT_TEMPLATES : EVENT_TEMPLATES.slice(0, TEMPLATES_INITIAL_VISIBLE)).map(t => (
                  <Link
                    key={t.key}
                    href={`/create?template=${t.key}`}
                    className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-white shadow-[0_1px_4px_rgba(8,100,126,0.08)] border border-[rgba(14,150,176,0.14)] hover:border-[#0E96B0]/40 hover:shadow-[0_2px_10px_rgba(8,100,126,0.13)] transition-all no-underline group"
                  >
                    <span className="text-base leading-none">{t.icon}</span>
                    <span className="font-medium text-[13px] text-[#0D2B35] whitespace-nowrap">{t.label}</span>
                  </Link>
                ))}
                {!showAllTemplates ? (
                  <button
                    onClick={() => setShowAllTemplates(true)}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-[rgba(14,150,176,0.28)] text-[13px] text-[#0E96B0] font-medium hover:bg-[#F4FAFB] hover:border-[#0E96B0] transition-all whitespace-nowrap"
                  >
                    +{EVENT_TEMPLATES.length - TEMPLATES_INITIAL_VISIBLE} more
                  </button>
                ) : (
                  <button
                    onClick={() => setShowAllTemplates(false)}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-[rgba(14,150,176,0.28)] text-[13px] text-[#5A8399] font-medium hover:bg-[#F4FAFB] transition-all whitespace-nowrap"
                  >
                    Show fewer ↑
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {events.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#E6F7FB] to-[#cceef6] flex items-center justify-center mx-auto mb-5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-[#0E96B0]">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <h2 className="font-serif text-[22px] text-[#0D2B35] mb-2">No Events Yet</h2>
              <p className="text-sm text-[#5A8399] mb-7 leading-relaxed">
                {isWardBrand
                  ? "Pick a template or create a custom event from scratch."
                  : "Create your first event to start managing signups for your ministry or church."}
              </p>
              <Link
                href="/create"
                className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.35)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(14,150,176,0.45)] transition-all no-underline"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Create Event
              </Link>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => {
                const eventType = (event as any).event_type;
                const isItems = eventType === "items";
                const sessions = (event as any).sessions || [];
                const campaignItems = (event as any).campaign_items || [];
                const totalCapacity = isItems
                  ? campaignItems.length
                  : sessions.reduce((sum: number, s: any) => sum + (s.capacity || 0), 0);
                const totalSignups = isItems
                  ? campaignItems.reduce((sum: number, it: any) => sum + (it.item_signups?.length || 0), 0)
                  : sessions.reduce((sum: number, s: any) => sum + (s.signups?.length || 0), 0);
                const remaining = isItems
                  ? campaignItems.filter((it: any) => (it.item_signups?.length ?? 0) === 0).length
                  : totalCapacity - totalSignups;
                const fillPct = totalCapacity > 0 ? Math.round((totalSignups / totalCapacity) * 100) : 0;
                const labels = isItems
                  ? { total: "Items", signedUp: "Claimed", remaining: "Unclaimed" }
                  : { total: "Total spots", signedUp: "Signed Up", remaining: "Remaining" };

                return (
                  <div
                    key={event.id}
                    className="bg-white rounded-2xl shadow-[0_2px_16px_rgba(8,100,126,0.08)] hover:shadow-[0_6px_28px_rgba(8,100,126,0.14)] transition-shadow relative flex flex-col"
                  >
                    {/* Card header */}
                    <div className="p-6 pb-4 flex-1">
                      <div className="absolute top-4 right-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenDropdown(openDropdown === event.id ? null : event.id);
                          }}
                          className="p-2 hover:bg-[#0E96B0]/8 rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4 text-[#5A8399]" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                          </svg>
                        </button>

                        {openDropdown === event.id && (
                          <div className="absolute right-0 mt-1 min-w-[11rem] w-max max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-[0_8px_28px_rgba(8,100,126,0.16)] border border-[#0E96B0]/10 py-1 z-10">
                            <Link
                              href={`/edit/${event.id}`}
                              className="block px-4 py-2.5 text-sm text-[#2E5566] hover:bg-[#E6F7FB] hover:text-[#0D2B35] transition-colors no-underline"
                              onClick={() => setOpenDropdown(null)}
                            >
                              Edit
                            </Link>
                            <button
                              type="button"
                              onClick={() => {
                                const anchorDate = earliestYmd([
                                  (event as any).event_date,
                                  ...(Array.isArray((event as any).event_dates) ? (event as any).event_dates : []),
                                  ...(((event as any).sessions ?? []) as any[]).map((s) => s?.session_date),
                                ]);
                                setDuplicateModal({ id: event.id, name: event.name, anchorDate });
                                setOpenDropdown(null);
                              }}
                              className="block w-full text-left px-4 py-2.5 text-sm text-[#2E5566] hover:bg-[#E6F7FB] hover:text-[#0D2B35] transition-colors"
                            >
                              Duplicate
                            </button>
                            <Link
                              href={`/event/${event.id}`}
                              className="block px-4 py-2.5 text-sm text-[#2E5566] hover:bg-[#E6F7FB] hover:text-[#0D2B35] transition-colors no-underline"
                              onClick={() => setOpenDropdown(null)}
                            >
                              Preview
                            </Link>
                            <Link
                              href={`/event/${event.id}/flyer`}
                              className="block px-4 py-2.5 text-sm text-[#2E5566] hover:bg-[#E6F7FB] hover:text-[#0D2B35] transition-colors no-underline"
                              onClick={() => setOpenDropdown(null)}
                            >
                              Print flyer
                            </Link>
                            <button
                              type="button"
                              onClick={async () => {
                                setOpenDropdown(null);
                                try {
                                  await downloadEventQr(event.id, event.name);
                                } catch (err) {
                                  console.error("QR download failed:", err);
                                }
                              }}
                              className="block w-full text-left px-4 py-2.5 text-sm text-[#2E5566] hover:bg-[#E6F7FB] hover:text-[#0D2B35] transition-colors"
                            >
                              Download QR code
                            </button>
                            <button
                              type="button"
                              onClick={() => copyEventLink(event.id)}
                              className="block w-full text-left px-4 py-2.5 text-sm text-[#2E5566] hover:bg-[#E6F7FB] hover:text-[#0D2B35] transition-colors"
                            >
                              Copy link
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteModal({ id: event.id, name: event.name });
                                setOpenDropdown(null);
                              }}
                              className="block w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>

                      <h3 className="font-serif text-[18px] text-[#0D2B35] mb-1 pr-8 leading-snug">
                        {event.name}
                      </h3>
                      <p className="text-xs text-[#5A8399] mb-4">
                        Created {new Date(event.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>

                      {/* Stats */}
                      {!isItems && totalCapacity >= 999 ? (
                        /* Unlimited capacity — 2-col layout, no "Remaining" */
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          <div className="bg-[#edfaf4] rounded-xl p-2.5 text-center">
                            <div className="text-[10px] font-semibold tracking-[0.5px] uppercase text-[#1D9E75] mb-0.5">Signed Up</div>
                            <div className="text-xl font-semibold text-[#0F6E56]">{totalSignups}</div>
                          </div>
                          <div className="bg-[#E6F7FB] rounded-xl p-2.5 text-center">
                            <div className="text-[10px] font-semibold tracking-[0.5px] uppercase text-[#0E96B0] mb-0.5">Capacity</div>
                            <div className="text-base font-semibold text-[#054F64]">Unlimited</div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-3 gap-2 mb-4">
                            <div className="bg-[#E6F7FB] rounded-xl p-2.5 text-center">
                              <div className="text-[10px] font-semibold tracking-[0.5px] uppercase text-[#0E96B0] mb-0.5">{labels.total}</div>
                              <div className="text-xl font-semibold text-[#054F64]">{totalCapacity}</div>
                            </div>
                            <div className="bg-[#edfaf4] rounded-xl p-2.5 text-center">
                              <div className="text-[10px] font-semibold tracking-[0.5px] uppercase text-[#1D9E75] mb-0.5">{labels.signedUp}</div>
                              <div className="text-xl font-semibold text-[#0F6E56]">{totalSignups}</div>
                            </div>
                            <div className="rounded-xl p-2.5 text-center" style={{ background: remaining === 0 ? "#fef2f2" : "#fdf6ec" }}>
                              <div className="text-[10px] font-semibold tracking-[0.5px] uppercase mb-0.5" style={{ color: remaining === 0 ? "#ef4444" : "#d97706" }}>{labels.remaining}</div>
                              <div className="text-xl font-semibold" style={{ color: remaining === 0 ? "#dc2626" : "#b45309" }}>{remaining}</div>
                            </div>
                          </div>
                          {/* Fill bar */}
                          <div className="h-1.5 bg-[#0E96B0]/10 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#22C8D8] to-[#08647E] transition-all"
                              style={{ width: `${fillPct}%` }}
                            />
                          </div>
                          <div className="text-[11px] text-[#5A8399] mt-1.5 text-right">{fillPct}% filled</div>
                        </>
                      )}
                    </div>

                    {/* Card footer */}
                    <div className="px-6 pb-6 flex gap-2">
                      <Link
                        href={`/admin/${event.id}`}
                        className="flex-1 text-sm font-semibold text-center px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_3px_10px_rgba(14,150,176,0.30)] hover:-translate-y-0.5 hover:shadow-[0_5px_16px_rgba(14,150,176,0.40)] transition-all no-underline"
                      >
                        Manage
                      </Link>
                      <Link
                        href={`/event/${event.id}`}
                        className="flex-1 text-sm font-semibold text-center px-4 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/30 text-[#08647E] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all no-underline"
                      >
                        Preview
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Connect to Claude */}
          <div className="mt-8 max-w-sm">
            <ConnectToClaudeCard />
          </div>
        </div>
      </main>

      {deleteModal && (
        <DeleteModal
          eventId={deleteModal.id}
          eventName={deleteModal.name}
          onConfirm={handleDelete}
          onCancel={() => setDeleteModal(null)}
        />
      )}

      {duplicateModal && (
        <DuplicateModal
          eventName={duplicateModal.name}
          anchorDate={duplicateModal.anchorDate}
          duplicating={duplicating}
          onConfirm={handleDuplicate}
          onCancel={() => setDuplicateModal(null)}
        />
      )}

      {orgNeedsNaming && (
        <OrgNameModal
          orgId={orgNeedsNaming.id}
          initialName={orgNeedsNaming.name}
          brandLabel={brand.name}
          getAccessToken={async () => {
            const supabase = createClientComponentClient();
            const { data: { session } } = await supabase.auth.getSession();
            return session?.access_token ?? null;
          }}
          onComplete={() => setOrgNeedsNaming(null)}
        />
      )}
    </>
  );
}
