"use client";

import { useEventPageState, type EventPageInit, type EventPageState } from "./useEventPageState";
import { useEventPageData, type EventPageData } from "./useEventPageData";
import { useSignupFunnel, type SignupFunnel } from "./useSignupFunnel";

/** Everything the public event page and its sections read. */
export function useEventPage(eventId: string, init: EventPageInit = {}) {
  const h0 = useEventPageState(eventId, init);
  const h1 = useEventPageData(h0, init);
  const h2 = useSignupFunnel(h0);
  return { ...h0, ...h1, ...h2 } as EventPageState & EventPageData & SignupFunnel;
}

export type EventPageCtx = ReturnType<typeof useEventPage>;
