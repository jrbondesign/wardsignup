"use client";

import { useAdminEventState, type AdminEventState } from "./useAdminEventState";
import { useAdminSignupActions, type AdminSignupActions } from "./useAdminSignupActions";
import { useAdminDeleteActions, type AdminDeleteActions } from "./useAdminDeleteActions";
import { useLoadAdminEvent } from "./useLoadAdminEvent";
import { useAdminEventSettings, type AdminEventSettings } from "./useAdminEventSettings";

/** Everything the Manage event page and its sections read. */
export function useAdminEvent(params: Promise<{ id: string }>) {
  const h0 = useAdminEventState(params);
  const h1 = useAdminSignupActions(h0);
  const h2 = useAdminDeleteActions({ ...h0, ...h1 });
  useLoadAdminEvent({ ...h0, ...h1, ...h2 });
  const h4 = useAdminEventSettings({ ...h0, ...h1, ...h2 });
  return { ...h0, ...h1, ...h2, ...h4 } as AdminEventState & AdminSignupActions & AdminDeleteActions & AdminEventSettings;
}

export type AdminEventCtx = ReturnType<typeof useAdminEvent>;
