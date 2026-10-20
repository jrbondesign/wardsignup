"use client";

import { createClientComponentClient } from "@/lib/auth";
import { type AdminEventState } from "./useAdminEventState";

/** Opens the remove-signup confirm dialog. */
export function useAdminSignupActions(ctx: AdminEventState) {
  const {
    setConfirmDialog,
    setCustomSignups,
    setItems,
    setSessions,
    setShowToast,
    setToastMessage,
  } = ctx;

  const handleRemoveSignup = async (signupId: string, memberName: string) => {
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
      setToastMessage(`Removed ${memberName}`);
      setShowToast(true);
    } catch (err: any) {
      setToastMessage(`Could not remove ${memberName}. Try again.`);
      setShowToast(true);
    }
  };

  const handleRemoveItemSignup = async (signupId: string, memberName: string, itemLabel: string) => {
    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/item-signups/${signupId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to remove signup");
      // Remove from local state without a full reload
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          item_signups: item.item_signups.filter((su) => su.id !== signupId),
        }))
      );
      // Also remove from custom signups if it was there
      setCustomSignups((prev) => prev.filter((su) => su.id !== signupId));
      setToastMessage(`Removed ${memberName}`);
      setShowToast(true);
    } catch (err: any) {
      setToastMessage(`Could not remove ${memberName}. Try again.`);
      setShowToast(true);
    }
  };

  const showConfirmRemove = (signupId: string, memberName: string, contextLabel: string, isItemSignup: boolean) => {
    setConfirmDialog({ signupId, memberName, contextLabel, isItemSignup });
  };

  return {
    handleRemoveSignup,
    handleRemoveItemSignup,
    showConfirmRemove,
  };
}

export type AdminSignupActions = ReturnType<typeof useAdminSignupActions>;
