"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type SignupInfo = {
  member_name: string;
  campaign_name: string;
  slot_label: string;
  event_url: string;
};

type PageState =
  | { status: "loading" }
  | { status: "found"; info: SignupInfo }
  | { status: "confirming"; info: SignupInfo }
  | { status: "cancelling"; info: SignupInfo }
  | { status: "cancelled" }
  | { status: "not_found" }
  | { status: "error"; message: string };

export default function CancelSignupPage() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : "";
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ status: "not_found" });
      return;
    }
    fetch(`/api/signups/cancel/lookup?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error === "not_found") {
          setState({ status: "not_found" });
        } else if (data.error) {
          setState({ status: "error", message: data.error });
        } else {
          setState({ status: "found", info: data });
        }
      })
      .catch(() => setState({ status: "error", message: "Something went wrong." }));
  }, [token]);

  async function handleCancel() {
    if (state.status !== "found" && state.status !== "confirming") return;
    setState({ status: "cancelling", info: state.info });
    try {
      const r = await fetch("/api/signups/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await r.json();
      if (data.ok) {
        setState({ status: "cancelled" });
      } else if (data.error === "not_found") {
        setState({ status: "not_found" });
      } else {
        setState({ status: "error", message: data.error ?? "Failed to cancel." });
      }
    } catch {
      setState({ status: "error", message: "Something went wrong. Please try again." });
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#F4FAFB]">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.10)] p-10 text-center">

        {state.status === "loading" && (
          <p className="text-[15px] text-[#5A8399]">Loading…</p>
        )}

        {state.status === "not_found" && (
          <>
            <div className="w-14 h-14 rounded-full bg-[#E6F7FB] flex items-center justify-center mx-auto mb-5">
              <svg viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h1 className="font-serif text-[22px] text-[#0D2B35] mb-3">Already removed</h1>
            <p className="text-[15px] text-[#5A8399] leading-relaxed">
              This signup has already been removed. The slot is now open for someone else.
            </p>
          </>
        )}

        {(state.status === "found" || state.status === "confirming") && (
          <>
            <h1 className="font-serif text-[22px] text-[#0D2B35] mb-2">Cancel your signup</h1>
            <p className="text-[15px] text-[#5A8399] mb-1">
              Hi <strong className="text-[#0D2B35]">{state.info.member_name}</strong>,
            </p>
            <p className="text-[15px] text-[#5A8399] mb-1">
              You&apos;re signed up for <strong className="text-[#0D2B35]">{state.info.campaign_name}</strong>.
            </p>
            <p className="text-[14px] text-[#5A8399] mb-8">
              <strong>Slot:</strong> {state.info.slot_label}
            </p>

            {state.status === "found" && (
              <button
                onClick={() => setState({ status: "confirming", info: state.info })}
                className="w-full py-3 rounded-xl text-white font-semibold bg-gradient-to-br from-red-400 to-red-600 shadow-sm hover:-translate-y-0.5 transition-all text-[15px]"
              >
                Remove my signup
              </button>
            )}

            {state.status === "confirming" && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-left">
                <p className="text-[14px] text-red-800 font-medium mb-4">
                  Are you sure you want to cancel your signup for <strong>{state.info.campaign_name}</strong>? This cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleCancel}
                    className="flex-1 py-2.5 rounded-lg text-white font-semibold bg-red-500 hover:bg-red-600 transition-colors text-[14px]"
                  >
                    Yes, remove me
                  </button>
                  <button
                    onClick={() => setState({ status: "found", info: state.info })}
                    className="flex-1 py-2.5 rounded-lg font-semibold text-[#0D2B35] border border-[#0E96B0]/30 hover:bg-[#E6F7FB] transition-colors text-[14px]"
                  >
                    Keep my signup
                  </button>
                </div>
              </div>
            )}

            <div className="mt-6">
              <Link href={state.info.event_url} className="text-[13px] text-[#5A8399] hover:text-[#0E96B0] transition-colors">
                View event page
              </Link>
            </div>
          </>
        )}

        {state.status === "cancelling" && (
          <p className="text-[15px] text-[#5A8399]">Removing your signup…</p>
        )}

        {state.status === "cancelled" && (
          <>
            <div className="w-14 h-14 rounded-full bg-[#E6F7FB] flex items-center justify-center mx-auto mb-5">
              <svg viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h1 className="font-serif text-[22px] text-[#0D2B35] mb-3">You&apos;re removed</h1>
            <p className="text-[15px] text-[#5A8399] leading-relaxed">
              Your signup has been removed and the slot is now open for someone else.
            </p>
          </>
        )}

        {state.status === "error" && (
          <>
            <div className="w-14 h-14 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-red-500">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h1 className="font-serif text-[22px] text-[#0D2B35] mb-3">Something went wrong</h1>
            <p className="text-[15px] text-[#5A8399] mb-6">{state.status === "error" ? state.message : ""}</p>
            <button
              onClick={() => setState({ status: "loading" })}
              className="text-[14px] text-[#0E96B0] hover:underline"
            >
              Try again
            </button>
          </>
        )}
      </div>
    </main>
  );
}
