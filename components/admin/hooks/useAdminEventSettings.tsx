"use client";

import { createClientComponentClient } from "@/lib/auth";
import { type CreateFormState } from "@/lib/create-form-state";
import { coverFileError, prepareCoverUpload } from "@/lib/cover-upload";
import { organizerReportErrorHint } from "@/lib/organizer-report-ui";
import { type AdminEventState } from "./useAdminEventState";
import { type AdminSignupActions } from "./useAdminSignupActions";
import { type AdminDeleteActions } from "./useAdminDeleteActions";

/** Auto-saved settings, cover image and organizer report actions. */
export function useAdminEventSettings(ctx: AdminEventState & AdminSignupActions & AdminDeleteActions) {
  const {
    allowGuests,
    digestEnabled,
    eventId,
    eventTimezone,
    instantEnabled,
    leaderEmail,
    leaderName,
    leaderSaveTimer,
    listOnDirectory,
    setAllowGuests,
    setCalendarId,
    setCalendarName,
    setCalendarOpen,
    setCalendarSyncEnabled,
    setCoverPosition,
    setCoverPreview,
    setCoverUploading,
    setCoverUrl,
    setDigestEnabled,
    setEvent,
    setEventTimezone,
    setInstantEnabled,
    setInviteLeader,
    setLeaderEmail,
    setLeaderName,
    setListOnDirectory,
    setNotificationsOpen,
    setRegistrationOpen,
    setSendingReport,
    setSettingsOpen,
    setShowCapacityPublicly,
    setShowSignupsPublicly,
    setShowToast,
    setToastMessage,
    setVisibilityOpen,
    showCapacityPublicly,
    showSignupsPublicly,
  } = ctx;

  const patchOrganizerEmailPrefs = async (partial: {
    organizer_digest_enabled?: boolean;
    organizer_instant_notify_enabled?: boolean;
    show_signups_publicly?: boolean;
    list_on_directory?: boolean;
    allow_guests?: boolean;
    show_capacity_publicly?: boolean;
    event_timezone?: string;
    leader_name?: string | null;
    leader_email?: string | null;
  }) => {
    const supabase = createClientComponentClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify(partial),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to save email settings");
    }
    setEvent((prev: any) => (prev ? { ...prev, ...partial } : prev));
  };

  const applyOptionalSettingsPatch = (patch: Partial<CreateFormState>) => {
    if ("expanded" in patch && patch.expanded) {
      if ("visibility" in patch.expanded) setVisibilityOpen(Boolean(patch.expanded.visibility));
      if ("notifications" in patch.expanded) setNotificationsOpen(Boolean(patch.expanded.notifications));
      if ("settings" in patch.expanded) setSettingsOpen(Boolean(patch.expanded.settings));
      if ("googleCalendar" in patch.expanded) setCalendarOpen(Boolean(patch.expanded.googleCalendar));
      if ("registration" in patch.expanded) setRegistrationOpen(Boolean(patch.expanded.registration));
    }
    if ("calendarSyncEnabled" in patch && typeof patch.calendarSyncEnabled === "boolean") {
      setCalendarSyncEnabled(patch.calendarSyncEnabled);
    }
    if ("calendarId" in patch && typeof patch.calendarId === "string") {
      setCalendarId(patch.calendarId);
    }
    if ("calendarName" in patch && typeof patch.calendarName === "string") {
      setCalendarName(patch.calendarName);
    }
    if ("inviteLeader" in patch && typeof patch.inviteLeader === "boolean") {
      setInviteLeader(patch.inviteLeader);
    }

    const saveBool = (
      key: keyof CreateFormState,
      apiKey: "show_signups_publicly" | "list_on_directory" | "organizer_digest_enabled" | "organizer_instant_notify_enabled" | "allow_guests" | "show_capacity_publicly",
      current: boolean,
      setter: (v: boolean) => void,
    ) => {
      if (!(key in patch) || typeof patch[key] !== "boolean") return;
      const next = patch[key] as boolean;
      setter(next);
      patchOrganizerEmailPrefs({ [apiKey]: next }).catch((err: unknown) => {
        setter(current);
        alert(err instanceof Error ? err.message : "Could not save");
      });
    };

    saveBool("showSignupsPublicly", "show_signups_publicly", showSignupsPublicly, setShowSignupsPublicly);
    saveBool("listOnDirectory", "list_on_directory", listOnDirectory, setListOnDirectory);
    saveBool("organizerDigestEnabled", "organizer_digest_enabled", digestEnabled, setDigestEnabled);
    saveBool("organizerInstantNotifyEnabled", "organizer_instant_notify_enabled", instantEnabled, setInstantEnabled);
    saveBool("allowGuests", "allow_guests", allowGuests, setAllowGuests);
    saveBool("showCapacityPublicly", "show_capacity_publicly", showCapacityPublicly, setShowCapacityPublicly);

    if ("eventTimezone" in patch && typeof patch.eventTimezone === "string") {
      const next = patch.eventTimezone;
      const prev = eventTimezone;
      setEventTimezone(next);
      patchOrganizerEmailPrefs({ event_timezone: next }).catch((err: unknown) => {
        setEventTimezone(prev);
        alert(err instanceof Error ? err.message : "Could not save");
      });
    }

    const hasName = "leaderName" in patch && typeof patch.leaderName === "string";
    const hasEmail = "leaderEmail" in patch && typeof patch.leaderEmail === "string";
    if (hasName || hasEmail) {
      const nextName = hasName ? (patch.leaderName as string) : leaderName;
      const nextEmail = hasEmail ? (patch.leaderEmail as string) : leaderEmail;
      if (hasName) setLeaderName(nextName);
      if (hasEmail) setLeaderEmail(nextEmail);
      const emailTrim = nextEmail.trim();
      if (!emailTrim || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
        if (leaderSaveTimer.current) clearTimeout(leaderSaveTimer.current);
        leaderSaveTimer.current = setTimeout(() => {
          patchOrganizerEmailPrefs({
            leader_name: nextName.trim() || null,
            leader_email: emailTrim || null,
          }).catch((err: unknown) => {
            alert(err instanceof Error ? err.message : "Could not save");
          });
        }, 800);
      }
    }
  };

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileError = coverFileError(file);
    if (fileError) {
      alert(fileError);
      e.target.value = "";
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const img = new window.Image();
    img.onerror = () => {
      alert("We couldn't read that image. Please try a different JPEG, PNG, or WebP file.");
      URL.revokeObjectURL(objectUrl);
    };
    img.onload = async () => {
      if (img.width / img.height < 0.9) {
        alert("Please upload a landscape image (wider than tall). Recommended 1600 × 800 px (2:1), at least 1200 × 600.");
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setCoverPreview(objectUrl);
      setCoverUploading(true);
      try {
        const supabase = createClientComponentClient();
        const { data: { session } } = await supabase.auth.getSession();
        const form = new FormData();
        form.append("file", await prepareCoverUpload(file));
        form.append("type", "cover");
        form.append("eventId", eventId);
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${session?.access_token}` },
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        setCoverUrl(data.url);
        setCoverPosition(null);
        setCoverPreview(null);
        URL.revokeObjectURL(objectUrl);
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Upload failed");
        setCoverPreview(null);
        URL.revokeObjectURL(objectUrl);
      } finally {
        setCoverUploading(false);
      }
    };
    img.src = objectUrl;
    e.target.value = "";
  };

  const handleCoverPositionSave = async (position: string) => {
    const supabase = createClientComponentClient();
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/events/${eventId}/cover`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ position }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Couldn't save position");
    }
    setCoverPosition(position);
  };

  const handleCoverRemove = async () => {
    if (!confirm("Remove the cover image for this event?")) return;
    setCoverUploading(true);
    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      await fetch("/api/upload", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "cover", eventId }),
      });
      setCoverUrl(null);
      setCoverPosition(null);
      setCoverPreview(null);
    } finally {
      setCoverUploading(false);
    }
  };

  const sendOrganizerReportNow = async () => {
    setSendingReport(true);
    try {
      const supabase = createClientComponentClient();
      let {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        const { data: refreshed, error: refErr } = await supabase.auth.refreshSession();
        if (refErr || !refreshed.session?.access_token) {
          throw new Error("Please sign in again, then try sending the report.");
        }
        session = refreshed.session;
      }
      const res = await fetch(`/api/events/${eventId}/organizer-report`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(organizerReportErrorHint(data.error || "Could not send report"));
      }
      if (data.resendId) {
        console.info("[organizer-report] Resend accepted:", data.resendId);
      }
      const to = typeof data.sentTo === "string" ? data.sentTo : "";
      setToastMessage(
        to ? `Report sent to ${to}. Check inbox and spam.` : "Report sent! Check your inbox.",
      );
      setShowToast(true);
    } catch (e: unknown) {
      alert(
        organizerReportErrorHint(
          e instanceof Error ? e.message : "Could not send report",
        ),
      );
    } finally {
      setSendingReport(false);
    }
  };

  return {
    patchOrganizerEmailPrefs,
    applyOptionalSettingsPatch,
    handleCoverChange,
    handleCoverPositionSave,
    handleCoverRemove,
    sendOrganizerReportNow,
  };
}

export type AdminEventSettings = ReturnType<typeof useAdminEventSettings>;
