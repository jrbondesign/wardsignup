"use client";

import { type AdminEventView } from "@/components/admin/hooks/deriveAdminEventView";

/** Delete event confirmation. */
export default function DeleteEventModal({ ctx }: { ctx: AdminEventView }) {
  const {
    deleting,
    event,
    handleDelete,
    setShowDeleteModal,
    showDeleteModal,
  } = ctx;

  return (
    showDeleteModal && (
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
  )
  );
}
