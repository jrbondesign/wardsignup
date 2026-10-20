"use client";

import { useEffect, useMemo, useState } from "react";
import { SignupFunnelTracker, type FunnelContext, type SignupFormKind } from "@/lib/signup-funnel";
import { type EventPageState } from "./useEventPageState";

/**
 * PostHog signup funnel (sheet_viewed → signup_form_started →
 * signup_email_entered → signup_completed). One tracker per page view; no
 * PII in any property. org_id comes from a tiny public lookup so ward-level
 * analysis works without group analytics.
 */
export function useSignupFunnel(ctx: EventPageState) {
  const { eventId, eventType, event, loading, items, sessions, posthog } = ctx;

  // Ward context for this event id. Resolved means the lookup finished
  // (success or failure) for the current event id; keyed on the id so a
  // different event never reuses a stale ward.
  const [wardCtx, setWardCtx] = useState<{ eventId: string; orgId: string | null; isTestOrg: boolean | null } | null>(null);
  const orgIdResolved = wardCtx?.eventId === eventId;
  const orgId = orgIdResolved ? wardCtx.orgId : null;
  const isTestOrg = orgIdResolved ? wardCtx.isTestOrg : null;

  // One tracker per page view (per event id), so each funnel step fires once.
  // The PostHog client from the provider is a stable singleton.
  const { tracker: funnel } = useMemo(
    () => ({ eventId, tracker: new SignupFunnelTracker((name, props) => posthog?.capture(name, props)) }),
    [eventId, posthog],
  );
  const funnelCtx: FunnelContext = { orgId, isTestOrg, campaignId: eventId, sheetType: eventType };

  useEffect(() => {
    let cancelled = false;
    let resolved: { orgId: string | null; isTestOrg: boolean | null } = { orgId: null, isTestOrg: null };
    fetch(`/api/events/${eventId}/analytics-context`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: { orgId?: string | null; isTestOrg?: boolean | null }) => {
        resolved = {
          orgId: typeof d.orgId === "string" ? d.orgId : null,
          isTestOrg: typeof d.isTestOrg === "boolean" ? d.isTestOrg : null,
        };
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setWardCtx({ eventId, ...resolved });
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // Fires once per page view, after the sheet data (server rendered or
  // browser loaded) and the ward context have both resolved. The tracker
  // dedupes, so background refreshes of the sheet data don't refire it.
  useEffect(() => {
    if (loading || !event || !orgIdResolved) return;
    funnel.sheetViewed(
      funnelCtx,
      eventType === "items" ? { item_count: items.length } : { slot_count: sessions.length },
    );
    // funnelCtx is derived from the deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, event, orgIdResolved, orgId, isTestOrg, eventType, items.length, sessions.length, funnel]);

  const trackFormStarted = (form: SignupFormKind, trigger: "field_focus" | "slot_selected" = "field_focus") => {
    funnel.formStarted(funnelCtx, form, trigger);
  };
  const trackEmailEntered = (form: SignupFormKind, email: string) => {
    funnel.emailEntered(funnelCtx, form, email);
  };

  return { funnelCtx, trackFormStarted, trackEmailEntered };
}

export type SignupFunnel = ReturnType<typeof useSignupFunnel>;
