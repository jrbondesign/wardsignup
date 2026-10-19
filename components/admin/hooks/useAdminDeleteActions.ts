"use client";

import { createClientComponentClient } from "@/lib/auth";
import { type AdminEventState } from "./useAdminEventState";
import { type AdminSignupActions } from "./useAdminSignupActions";

/** Cancel-remove and delete-event handlers. */
export function useAdminDeleteActions(ctx: AdminEventState & AdminSignupActions) {
  const {
    confirmDialog,
    error,
    event,
    eventId,
    menuButtonRefs,
    router,
    setConfirmDialog,
    setDeleting,
    setShowDeleteModal,
  } = ctx;

  const handleCancelRemove = () => {
    const signupId = confirmDialog?.signupId;
    setConfirmDialog(null);
    
    // Return focus to the menu button
    if (signupId) {
      const button = menuButtonRefs.current.get(signupId);
      if (button) {
        setTimeout(() => button.focus(), 100);
      }
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

  return {
    handleCancelRemove,
    handleDelete,
  };
}

export type AdminDeleteActions = ReturnType<typeof useAdminDeleteActions>;
