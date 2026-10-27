"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SignupFunnelTracker,
  buildFunnelProps,
  syncOrgIdSuperProperty,
  type FunnelContext,
  type SignupFormKind,
} from "@/lib/signup-funnel";
import { isEmailNudgeEligibleSheet, readEmailNudgeVariant, type EmailNudgeVariant } from "@/lib/email-nudge";
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

  // Ward id as a PostHog super property once the lookup resolves, so it also
  // rides on events buildFunnelProps can't reach, like the experiment
  // exposure ($feature_flag_called). Removed while another sheet's lookup is
  // pending and when the page unmounts, so it never leaks to other pages.
  useEffect(() => {
    if (!orgIdResolved) return;
    syncOrgIdSuperProperty(posthog, orgId);
    return () => syncOrgIdSuperProperty(posthog, null);
  }, [orgIdResolved, orgId, posthog]);

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

  // ---- Email nudge experiment (flag email-capture-next, lib/email-nudge.ts).
  // The flag is read once, on signup_form_started, on spots / rsvp sheets
  // only; that read is the exposure. null = flags not loaded or PostHog
  // error: control, no exposure.
  //
  // org_id has to be registered before the read so the exposure carries it.
  // If the form starts while the ward lookup is still running, the read waits
  // for the lookup (it always settles, success or failure). Until then
  // nudgeVariant() is null, i.e. control, same as flags not loaded.
  const nudgeVariantRef = useRef<{ eventId: string; variant: EmailNudgeVariant | null } | null>(null);
  const pendingNudgeReadRef = useRef<string | null>(null);
  const readNudgeVariant = () => {
    syncOrgIdSuperProperty(posthog, orgId);
    nudgeVariantRef.current = { eventId, variant: readEmailNudgeVariant(posthog as never) };
  };
  useEffect(() => {
    if (!orgIdResolved || pendingNudgeReadRef.current !== eventId) return;
    pendingNudgeReadRef.current = null;
    readNudgeVariant();
    // readNudgeVariant is derived from the deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIdResolved, orgId, eventId]);
  const nudgeVariant = (): EmailNudgeVariant | null =>
    nudgeVariantRef.current?.eventId === eventId ? nudgeVariantRef.current.variant : null;
  const captureNudge = (name: string) => {
    try {
      posthog?.capture(name, buildFunnelProps(funnelCtx, { variant: nudgeVariant() ?? "control", form: "slots" }));
    } catch {
      // Analytics must never break the signup page.
    }
  };

  const trackFormStarted = (form: SignupFormKind, trigger: "field_focus" | "slot_selected" = "field_focus") => {
    const started = funnel.formStarted(funnelCtx, form, trigger);
    if (started && form === "slots" && isEmailNudgeEligibleSheet(eventType)) {
      if (orgIdResolved) readNudgeVariant();
      else pendingNudgeReadRef.current = eventId;
    }
  };
  const trackEmailEntered = (form: SignupFormKind, email: string) => {
    funnel.emailEntered(funnelCtx, form, email);
  };

  return { funnelCtx, trackFormStarted, trackEmailEntered, nudgeVariant, captureNudge };
}

export type SignupFunnel = ReturnType<typeof useSignupFunnel>;
