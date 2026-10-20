"use client";

import { LoadingSpinner } from "@/components/LoadingSpinner";
import Link from "next/link";
import Image from "next/image";
import MadeWithFooter from "@/components/MadeWithFooter";
import { useEventPage } from "@/components/event/hooks/useEventPage";
import { deriveEventPageView } from "@/components/event/hooks/deriveEventPageView";
import EventHeaderCard from "@/components/event/sections/EventHeaderCard";
import SingleSessionSignup from "@/components/event/sections/SingleSessionSignup";
import ItemsSignupList from "@/components/event/sections/ItemsSignupList";
import SessionsBrowser from "@/components/event/sections/SessionsBrowser";
import SelectionBar from "@/components/event/sections/SelectionBar";
import SignupFormModal from "@/components/event/sections/SignupFormModal";
import { useSyncExternalStore } from "react";
import type { PublicEventPageData } from "@/lib/public-event-page";
import type { PublicCover } from "@/lib/use-public-cover";

const noopSubscribe = () => () => {};

/**
 * False during the server render and hydration, true after. Slot lists,
 * calendars and "past" filtering depend on the visitor's local date, which the
 * server (UTC) can't know, so those render only after hydration. The title and
 * description (the LCP element) render on the server.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export interface EventPageClientProps {
  eventId: string;
  /** Server loaded data: object = loaded, null = no such event, undefined = load in the browser. */
  initialPage?: PublicEventPageData | null;
  /** Server loaded cover: object = show, null = none or flag off, undefined = fetch in the browser. */
  initialCover?: PublicCover | null;
}


export default function EventPageClient({ eventId, initialPage, initialCover }: EventPageClientProps) {
  const ctx = useEventPage(eventId, { initialPage, initialCover });
  const hydrated = useHydrated();
  const {
    brand,
    event,
    eventType,
    loading,
    selectedSessions,
    sessions,
    setSelectedCalendarDate,
    setViewMode,
    showSignupForm,
    success,
    viewMode,
  } = ctx;


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

  const view = { ...ctx, event, ...deriveEventPageView({ ...ctx, event }) };
  const {
    groupedSessions,
    isSingleSession,
  } = view;

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
        <EventHeaderCard ctx={view} />

        {/* No account required callout - appears between event card and signup sections */}
        {!success && (
          <div className="mb-6 px-4 py-3 bg-[#E6F7FB] border border-[#0E96B0]/20 rounded-xl">
            <p className="text-sm text-[#08647E] font-medium">
              ✨ No account needed. Pick a slot and enter your name.
            </p>
          </div>
        )}

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

        {!hydrated ? (
          <div className="flex justify-center py-10" aria-hidden>
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <>
        {/* ── Single-session inline form ──────────────────────────────────── */}
        <SingleSessionSignup ctx={view} />

        {/* ── Items type ─────────────────────────────────────────────────── */}
        <ItemsSignupList ctx={view} />

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
              <p className="text-sm text-[#5A8399]">
                {(() => {
                  if (sessions.length === 0) return "No slots yet. Check back soon!";
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const allPast = sessions.every((s) => {
                    if (!s.session_date) return false;
                    const [y, m, d] = s.session_date.split("-").map(Number);
                    return new Date(y, m - 1, d) < today;
                  });
                  if (allPast) return "This event has ended. All slots have passed.";
                  return "All slots are full.";
                })()}
              </p>
            </div>
          ) : null
        )}
        <SessionsBrowser ctx={view} />
          </>
        )}
      </main>

      {/* Floating action bar — hidden for single-session (uses inline form instead) */}
      {hydrated && <SelectionBar ctx={view} />}

      {/* Signup form modal */}
      {hydrated && <SignupFormModal ctx={view} />}

      <footer className="mt-auto flex-shrink-0 border-t border-[#0E96B0]/10 bg-white/90 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col items-center justify-center gap-4 text-center">
          <MadeWithFooter brandName={brand.name} siteUrl={brand.siteUrl} />
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
