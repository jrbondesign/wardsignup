"use client";

import { type AdminEventView } from "@/components/admin/hooks/deriveAdminEventView";
import DeleteEventConfirm from "@/components/event-actions/DeleteEventConfirm";

/** Delete event confirmation. */
export default function DeleteEventModal({ ctx }: { ctx: AdminEventView }) {
  const {
    deleting,
    event,
    handleDelete,
    setShowDeleteModal,
    showDeleteModal,
  } = ctx;

  if (!showDeleteModal) return null;
  return (
    <DeleteEventConfirm
      eventName={event.name}
      deleting={deleting}
      onConfirm={handleDelete}
      onCancel={() => setShowDeleteModal(false)}
    />
  );
}
