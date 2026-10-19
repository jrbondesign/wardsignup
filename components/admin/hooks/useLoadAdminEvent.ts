"use client";

import { useEffect } from "react";
import { createClientComponentClient } from "@/lib/auth";
import { campaignMatchesHostBrand } from "@/lib/campaign-brand-guard";
import { userCanAdminCampaign } from "@/lib/campaign-access";
import { CampaignItemWithSignups } from "@/lib/types";
import { type AdminEventState } from "./useAdminEventState";
import { type AdminSignupActions } from "./useAdminSignupActions";
import { type AdminDeleteActions } from "./useAdminDeleteActions";

/** Loads the event, access check, signups, settings and calendar sync. */
export function useLoadAdminEvent(ctx: AdminEventState & AdminSignupActions & AdminDeleteActions) {
  const {
    brand,
    eventId,
    router,
    setAllowGuests,
    setCalendarId,
    setCalendarLastError,
    setCalendarLastSyncedAt,
    setCalendarName,
    setCalendarSyncEnabled,
    setCoverPosition,
    setCoverUrl,
    setCustomSignups,
    setDigestEnabled,
    setError,
    setEvent,
    setEventTimezone,
    setEventType,
    setInstantEnabled,
    setInviteLeader,
    setItems,
    setLeaderEmail,
    setLeaderName,
    setListOnDirectory,
    setLoading,
    setLogoUrl,
    setSessions,
    setShareableLink,
    setShowCapacityPublicly,
    setShowSignupsPublicly,
    setViewerCanManage,
  } = ctx;

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClientComponentClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { router.push("/login"); return; }

      const { data: eventData, error: eventError } = await supabase
        .from("campaigns").select("*").eq("id", eventId).single();

      if (eventError || !eventData) { setError("Event not found"); setLoading(false); return; }

      if (!campaignMatchesHostBrand((eventData as { brand_id?: string }).brand_id, brand)) {
        setError("Event not found");
        setLoading(false);
        return;
      }

      const hasAccess = (eventData as any).created_by === user.id ||
                        (eventData as any).user_email === user.email ||
                        (await userCanAdminCampaign(supabase, user, eventData as any));
      if (!hasAccess) {
        setError("You don't have access to manage this event. If you were invited to co admin this ward, make sure you've accepted your invitation.");
        setLoading(false);
        return;
      }

      setViewerCanManage(true);
      setEvent(eventData);
      setCoverUrl((eventData as any).cover_image_url ?? null);
      setCoverPosition((eventData as any).cover_position ?? null);
      
      // Load calendar sync status
      const { data: calSyncData } = await supabase
        .from("campaign_calendar_sync")
        .select("enabled, last_synced_at, last_error, calendar_id, calendar_name, invite_leader")
        .eq("campaign_id", eventId)
        .maybeSingle();
      
      if (calSyncData) {
        setCalendarSyncEnabled(Boolean((calSyncData as any).enabled));
        setCalendarId((calSyncData as any).calendar_id || "");
        setCalendarName((calSyncData as any).calendar_name || "");
        setInviteLeader(Boolean((calSyncData as any).invite_leader));
        setCalendarLastSyncedAt((calSyncData as any).last_synced_at);
        setCalendarLastError((calSyncData as any).last_error);
      }

      const resolvedType: "spots" | "items" | "rsvp" =
        (eventData as any).event_type === "items" ? "items"
        : (eventData as any).event_type === "rsvp" ? "rsvp"
        : "spots";
      setEventType(resolvedType);

      if (resolvedType === "items") {
        const { data: itemsData } = await supabase
          .from("campaign_items")
          .select("*, item_signups(id, member_name, member_email, signup_note, quantity)")
          .eq("campaign_id", eventId)
          .order("sort_order")
          .order("created_at");
        setItems((itemsData || []) as CampaignItemWithSignups[]);

        const { data: customRows } = await supabase
          .from("item_signups")
          .select("id, member_name, member_email, custom_label, signup_note, quantity")
          .eq("campaign_id", eventId)
          .is("item_id", null)
          .order("signed_up_at");
        setCustomSignups((customRows ?? []) as never);
      } else {
        const { data: sessionsData } = await supabase
          .from("sessions").select("*, signups(*)")
          .eq("campaign_id", eventId).order("session_date", { ascending: true, nullsFirst: false }).order("day_of_week").order("time");
        setSessions(sessionsData || []);
      }
      setShareableLink(`${window.location.origin}/event/${eventId}`);
      setDigestEnabled(Boolean((eventData as any).organizer_digest_enabled));
      setInstantEnabled(Boolean((eventData as any).organizer_instant_notify_enabled));
      setShowSignupsPublicly(Boolean((eventData as any).show_signups_publicly));
      setListOnDirectory(typeof (eventData as any).list_on_directory === "boolean" ? (eventData as any).list_on_directory : true);
      const ag = (eventData as any).allow_guests;
      setAllowGuests(ag == null ? true : Boolean(ag));
      const scp = (eventData as any).show_capacity_publicly;
      setShowCapacityPublicly(scp == null ? true : Boolean(scp));
      const tzRaw = (eventData as any).event_timezone;
      if (typeof tzRaw === "string" && tzRaw.trim()) setEventTimezone(tzRaw.trim());
      setLeaderName((eventData as any).leader_name ?? "");
      setLeaderEmail((eventData as any).leader_email ?? "");

      // Future: Load org logo if Ward Signup supports custom logos
      const profileLogoUrl = null;
      setLogoUrl(profileLogoUrl);

      setLoading(false);
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters come from useAdminEventState and are stable
  }, [router, eventId, brand]);
}
