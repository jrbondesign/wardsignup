"use client";

import { DAYS, SessionWithSignups, orderSessionsBySection } from "@/components/admin/admin-page-shared";
import { isCoverImageEnabledForOrg } from "@/lib/cover-image-feature";
import { type AdminEventCtx } from "@/components/admin/hooks/useAdminEvent";

export type LoadedAdminEventCtx = Omit<AdminEventCtx, "event"> & { event: NonNullable<AdminEventCtx["event"]> };

/** Remove-signup confirm handler plus totals and grouped sessions computed from a loaded event. */
export function deriveAdminEventView(ctx: LoadedAdminEventCtx) {
  const {
    confirmDialog,
    customSignups,
    event,
    handleRemoveItemSignup,
    handleRemoveSignup,
    items,
    menuButtonRefs,
    sessions,
    setConfirmDialog,
  } = ctx;

  const handleConfirmRemove = () => {
    if (!confirmDialog) return;
    const { signupId, memberName, isItemSignup } = confirmDialog;
    setConfirmDialog(null);
    
    // Get all signup IDs in order before removing
    const allSignupIds: string[] = [];
    const slotHeadingIds: string[] = [];
    
    if (isItemSignup) {
      // For items: collect signup IDs from all items and custom signups
      items.forEach((item) => {
        item.item_signups.forEach((sig) => allSignupIds.push(sig.id));
      });
      customSignups.forEach((sig) => allSignupIds.push(sig.id));
    } else {
      // For spots/rsvp: collect signup IDs from all sessions in grouped order
      Object.entries(groupedSessions).forEach(([day, daySessions]) => {
        const orderedSessions = orderSessionsBySection(daySessions);
        orderedSessions.forEach((session) => {
          slotHeadingIds.push(`slot-heading-${session.id}`);
          session.signups.forEach((sig) => allSignupIds.push(sig.id));
        });
      });
    }
    
    const currentIndex = allSignupIds.indexOf(signupId);
    const nextSignupId = currentIndex >= 0 && currentIndex < allSignupIds.length - 1 
      ? allSignupIds[currentIndex + 1] 
      : null;
    
    if (isItemSignup) {
      handleRemoveItemSignup(signupId, memberName, "");
    } else {
      handleRemoveSignup(signupId, memberName);
    }
    
    // Move focus after removal
    setTimeout(() => {
      if (nextSignupId) {
        // Move to next row's dots button
        menuButtonRefs.current.get(nextSignupId)?.focus();
      } else if (!isItemSignup && slotHeadingIds.length > 0) {
        // Move to slot heading if this was the last signup in the slot
        const lastHeading = document.getElementById(slotHeadingIds[slotHeadingIds.length - 1]);
        if (lastHeading) {
          lastHeading.setAttribute('tabindex', '-1');
          lastHeading.focus();
        }
      }
    }, 100);
  };

  const coverEnabled = isCoverImageEnabledForOrg(
    (event as { organization_id?: string | null }).organization_id,
  );

  // Group by session_date when sessions have specific dates (missionary dinners, RSVP events),
  // otherwise group by day-of-week name (recurring spots without specific dates).
  const hasSessionDates = sessions.some((s) => s.session_date);
  const groupedSessions = sessions.reduce((acc, session) => {
    const key = hasSessionDates && session.session_date
      ? session.session_date  // ISO date "YYYY-MM-DD" — sorts chronologically
      : DAYS[session.day_of_week];
    if (!acc[key]) acc[key] = [];
    acc[key].push(session);
    return acc;
  }, {} as Record<string, SessionWithSignups[]>);

  const totalCapacity = sessions.reduce((sum, s) => sum + s.capacity, 0);
  const totalSignups = sessions.reduce((sum, s) => sum + (s.signups?.length || 0), 0);
  // Capacity is measured in signups (households); guests are shown separately.
  const totalPeople = totalSignups;
  const totalGuests = sessions.reduce(
    (sum, s) => sum + (s.signups ?? []).reduce((g, su) => g + (((su as any).guest_names as string[] | undefined)?.length ?? 0), 0),
    0,
  );
  const fillPct = totalCapacity > 0 ? Math.round((totalSignups / totalCapacity) * 100) : 0;

  return {
    handleConfirmRemove,
    coverEnabled,
    hasSessionDates,
    groupedSessions,
    totalCapacity,
    totalSignups,
    totalPeople,
    totalGuests,
    fillPct,
  };
}

export type AdminEventView = LoadedAdminEventCtx & ReturnType<typeof deriveAdminEventView>;
