"use client";

import { useEditEventState, type EditEventState } from "./useEditEventState";
import { useLoadEditEvent } from "./useLoadEditEvent";
import { useEditEventSettings, type EditEventSettings } from "./useEditEventSettings";
import { useScheduleBuilders, type ScheduleBuilders } from "./useScheduleBuilders";
import { useSlotActions, type SlotActions } from "./useSlotActions";
import { useSaveEditEvent, type SaveEditEvent } from "./useSaveEditEvent";

/** Everything the Edit event page and its sections read: state, loaders and actions. */
export function useEditEvent() {
  const h0 = useEditEventState();
  useLoadEditEvent(h0);
  const h2 = useEditEventSettings(h0);
  const h3 = useScheduleBuilders({ ...h0, ...h2 });
  const h4 = useSlotActions({ ...h0, ...h2, ...h3 });
  const h5 = useSaveEditEvent({ ...h0, ...h2, ...h3, ...h4 });
  return { ...h0, ...h2, ...h3, ...h4, ...h5 } as EditEventState & EditEventSettings & ScheduleBuilders & SlotActions & SaveEditEvent;
}

export type EditEventCtx = ReturnType<typeof useEditEvent>;
