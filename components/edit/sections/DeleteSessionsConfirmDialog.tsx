"use client";

import { type EditEventCtx } from "@/components/edit/hooks/useEditEvent";

export default function DeleteSessionsConfirmDialog({ ctx }: { ctx: EditEventCtx }) {
  const {
    deleteSessionsSignupCount,
    pendingDeleteSessionIdsRef,
    performSave,
    setShowDeleteSessionsConfirm,
    showDeleteSessionsConfirm,
  } = ctx;

  return (
    showDeleteSessionsConfirm && (
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
          You removed slot(s) that currently have <span className="font-semibold text-[#0D2B35]">{deleteSessionsSignupCount} signup{deleteSessionsSignupCount !== 1 ? "s" : ""}</span>.
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
  )
  );
}
