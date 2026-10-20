"use client";

import { type AdminEventView } from "@/components/admin/hooks/deriveAdminEventView";

/** Shareable link with copy button. */
export default function AdminShareLinkRow({ ctx }: { ctx: AdminEventView }) {
  const {
    event,
    eventId,
    isWardBrand,
    posthog,
    setShowToast,
    setToastMessage,
    shareableLink,
  } = ctx;

  return (
    <div className="rounded-xl border border-[#0E96B0]/18 bg-[#F8FCFD] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-[#0D2B35] mb-0.5">Signup link</div>
        <div className="text-[11px] text-[#5A8399] leading-snug">
          {isWardBrand
            ? "Copy and share with ward members. No account required to sign up"
            : "Copy and share with your group. No account required to sign up"}
        </div>
      </div>
      <div className="flex gap-2 sm:flex-shrink-0">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(shareableLink);
            posthog?.capture("event_shared", { event_id: eventId, campaign_id: eventId, org_id: (event as { organization_id?: string | null } | null)?.organization_id ?? null });
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
  );
}
