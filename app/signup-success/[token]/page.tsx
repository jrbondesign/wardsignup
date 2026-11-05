"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import { withUtm } from "@/lib/utm";
import {
  parseSignupSuccessInfo,
  readSignupSuccessRaw,
  type SignupSuccessInfo,
} from "@/lib/signup-success-handoff";
import { hasSignupCalendar, signupGoogleCalendarUrl, signupIcs } from "@/lib/signup-success-calendar";

type SignupInfo = SignupSuccessInfo;

const noopSubscribe = () => () => {};

const buildGoogleCalendarUrl = signupGoogleCalendarUrl;

function downloadIcal(info: SignupInfo) {
  const ics = signupIcs(info);
  if (!ics) return;

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${info.campaign_name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

type PageState =
  | { status: "loading" }
  | { status: "ready"; info: SignupInfo }
  | { status: "error" };

export default function SignupSuccessPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const posthog = usePostHog();
  const token = typeof params.token === "string" ? params.token : "";
  const eventId = searchParams.get("event") ?? "";
  const [fetchedState, setState] = useState<PageState>({ status: "loading" });
  // No token means there's nothing to look up; derive that instead of setting state in the effect.
  const lookupState: PageState = token ? fetchedState : { status: "error" };
  // Details handed over by the event page right after signup; when present the
  // confirmation renders at once and the lookup only gates the cancel link.
  const handoffRaw = useSyncExternalStore(
    noopSubscribe,
    () => (token ? readSignupSuccessRaw(token) : null),
    () => null,
  );
  const handoff = useMemo(() => parseSignupSuccessInfo(handoffRaw), [handoffRaw]);
  const state: PageState = handoff ? { status: "ready", info: handoff } : lookupState;
  const cancelReady = lookupState.status === "ready";

  useEffect(() => {
    if (!token) return;
    fetch(`/api/signups/cancel/lookup?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setState({ status: "error" });
        } else {
          setState({ status: "ready", info: data });
        }
      })
      .catch(() => setState({ status: "error" }));
  }, [token]);

  const createPageUrl = withUtm("/create", {
    utm_source: "signup_confirmation",
    utm_medium: "referral",
    utm_campaign: "run_your_own",
  });

  const handleRunYourOwnClick = () => {
    posthog?.capture("run_your_own_clicked", {
      source: "signup_confirmation_page",
      token,
      event_id: eventId,
    });
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#F4FAFB]">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.10)] p-10 text-center">

        {state.status === "loading" && (
          <p className="text-[15px] text-[#5A8399]">Loading…</p>
        )}

        {state.status === "ready" && (
          <>
            {/* Check icon */}
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#E6F7FB] to-[#cceef6] flex items-center justify-center mx-auto mb-6">
              <svg viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>

            <h1 className="font-serif text-[26px] text-[#0D2B35] mb-2">You&apos;re signed up!</h1>
            <p className="text-[15px] text-[#5A8399] mb-6">
              Thanks, <strong className="text-[#0D2B35]">{state.info.member_name}</strong>.
            </p>

            {/* Event details card */}
            <div className="rounded-xl bg-[#F4FAFB] border border-[#0E96B0]/12 px-5 py-4 text-left mb-8">
              <div className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.5px] mb-1">Event</div>
              <div className="text-[16px] font-semibold text-[#0D2B35] mb-3">{state.info.campaign_name}</div>
              <div className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.5px] mb-1">Your slot</div>
              <div className="text-[15px] text-[#0D2B35] mb-3">{state.info.slot_label}</div>
              {state.info.guest_names?.length > 0 && (
                <>
                  <div className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.5px] mb-1">Attending</div>
                  <div className="text-[14px] text-[#0D2B35]">
                    {[state.info.member_name, ...state.info.guest_names].join(", ")}
                  </div>
                </>
              )}
            </div>

            {/* Add to calendar */}
            {hasSignupCalendar(state.info) && (
              <div className="mb-4">
                <p className="text-[12px] font-semibold text-[#5A8399] uppercase tracking-[0.5px] mb-2">Add to calendar</p>
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={buildGoogleCalendarUrl(state.info)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-[1.5px] border-[rgba(14,150,176,0.25)] text-[13px] font-semibold text-[#0E96B0] hover:border-[#0E96B0] hover:bg-[#F4FAFB] transition-all no-underline"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" aria-hidden="true">
                      <path fill="#4285F4" d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12s4.48 10 10 10 10-4.48 10-10z"/>
                      <path fill="white" d="M12 7v5l3 3-1.5 1.5L10 13V7h2z"/>
                    </svg>
                    Google
                  </a>
                  <button
                    type="button"
                    onClick={() => downloadIcal(state.info as SignupInfo)}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-[1.5px] border-[rgba(14,150,176,0.25)] text-[13px] font-semibold text-[#0E96B0] hover:border-[#0E96B0] hover:bg-[#F4FAFB] transition-all"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    Apple Calendar
                  </button>
                </div>
              </div>
            )}

            {/* Primary CTA */}
            <Link
              href={state.info.event_url}
              className="block w-full py-3 rounded-xl text-white font-semibold bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] shadow-[0_4px_14px_rgba(14,150,176,0.3)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(14,150,176,0.4)] transition-all text-[15px] mb-4 no-underline"
            >
              Sign up for another slot
            </Link>

            {/* Cancel link: space is reserved until the lookup confirms it */}
            {cancelReady ? (
              <Link
                href={`/cancel/${token}`}
                className="text-[13px] text-[#5A8399] hover:text-[#0E96B0] transition-colors"
              >
                Need to cancel? Remove my signup
              </Link>
            ) : (
              <span aria-hidden="true" className="invisible text-[13px]" data-testid="cancel-link-placeholder">
                Need to cancel? Remove my signup
              </span>
            )}

            {/* Run your own CTA */}
            <div className="mt-6 pt-6 border-t border-[#0E96B0]/10">
              <Link
                href={createPageUrl}
                onClick={handleRunYourOwnClick}
                className="text-[13px] text-[#0E96B0] hover:text-[#08647E] font-semibold transition-colors"
              >
                Run your own ward signup, free
              </Link>
            </div>
          </>
        )}

        {state.status === "error" && (
          <>
            <div className="w-16 h-16 rounded-full bg-[#fef2f2] border border-red-200 flex items-center justify-center mx-auto mb-6">
              <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h1 className="font-serif text-[26px] text-[#0D2B35] mb-2">Unable to load signup</h1>
            <p className="text-[15px] text-[#5A8399] mb-6">
              We couldn&apos;t find your signup details. The link may have expired or already been used.
            </p>
            {eventId && (
              <Link
                href={`/event/${eventId}`}
                className="block w-full py-3 rounded-xl text-white font-semibold bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] shadow-[0_4px_14px_rgba(14,150,176,0.3)] hover:-translate-y-0.5 transition-all text-[15px] no-underline"
              >
                Back to event
              </Link>
            )}
          </>
        )}

      </div>
    </main>
  );
}
