"use client";

import { useEventPageState, type EventPageState } from "./useEventPageState";
import { useEventPageData, type EventPageData } from "./useEventPageData";

/** Everything the public event page and its sections read. */
export function useEventPage(params: Promise<{ id: string }>) {
  const h0 = useEventPageState(params);
  const h1 = useEventPageData(h0);
  return { ...h0, ...h1 } as EventPageState & EventPageData;
}

export type EventPageCtx = ReturnType<typeof useEventPage>;
