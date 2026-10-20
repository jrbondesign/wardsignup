"use client";

import { useEventPageState, type EventPageInit, type EventPageState } from "./useEventPageState";
import { useEventPageData, type EventPageData } from "./useEventPageData";

/** Everything the public event page and its sections read. */
export function useEventPage(eventId: string, init: EventPageInit = {}) {
  const h0 = useEventPageState(eventId, init);
  const h1 = useEventPageData(h0, init);
  return { ...h0, ...h1 } as EventPageState & EventPageData;
}

export type EventPageCtx = ReturnType<typeof useEventPage>;
