/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import {
  saveSlotsButtonLabel,
  savedSlotsToast,
  stagedReplaceBanner,
  slotWord,
} from "@/lib/edit-replace-copy";
import { useScheduleBuilders } from "@/components/edit/hooks/useScheduleBuilders";
import { useSaveEditEvent } from "@/components/edit/hooks/useSaveEditEvent";
import SessionsList from "@/components/edit/sections/SessionsList";

describe("replace-all copy", () => {
  it("pluralizes the banner, button, and post-save toast", () => {
    expect(slotWord(1)).toBe("slot");
    expect(slotWord(6)).toBe("slots");
    expect(stagedReplaceBanner(1)).toBe(
      "Not saved yet. Save to make this 1 slot live.",
    );
    expect(stagedReplaceBanner(6)).toBe(
      "Not saved yet. Save to make these 6 slots live.",
    );
    expect(saveSlotsButtonLabel(1)).toBe("Save 1 slot");
    expect(saveSlotsButtonLabel(6)).toBe("Save 6 slots");
    expect(savedSlotsToast(1)).toBe("Saved. 1 slot is live.");
    expect(savedSlotsToast(6)).toBe("Saved. 6 slots are live.");
  });

  it("does not use a dash in any of the new strings", () => {
    const strings = [
      stagedReplaceBanner(1),
      stagedReplaceBanner(2),
      saveSlotsButtonLabel(1),
      saveSlotsButtonLabel(2),
      savedSlotsToast(1),
      savedSlotsToast(2),
    ];
    for (const s of strings) {
      expect(s).not.toMatch(/[—–]/);
    }
  });
});

function buildersCtx(overrides: Record<string, unknown> = {}) {
  const noop = () => {};
  return {
    allowDestructiveDeletesOnceRef: { current: false },
    bulkCapacity: 1,
    bulkCapacityDraft: undefined,
    bulkDays: [],
    bulkEndDate: "",
    bulkEndTime: "",
    bulkLocation: "",
    bulkNotes: "",
    bulkStartDate: "",
    bulkTime: "19:00",
    isTithingReschedule: false,
    newSessionCapacity: 1,
    newSessionDate: "",
    newSessionDayOfWeek: 0,
    newSessionEndTime: "",
    newSessionLabel: "",
    newSessionLocation: "",
    newSessionNotes: "",
    newSessionSection: "",
    newSessionTime: "19:00",
    newSessionUseDate: false,
    rescheduleCapacity: 2,
    rescheduleCapacityDraft: undefined,
    rescheduleDays: [1, 2, 3, 4, 5],
    rescheduleEnd: new Date(2026, 10, 20),
    rescheduleEndTime: "18:00",
    rescheduleLocation: "",
    rescheduleNotes: "",
    rescheduleStart: new Date(2026, 10, 16),
    rescheduleTime: "17:00",
    sessions: [{ day_of_week: 1, time: "10:00", capacity: 1, location: "", notes: "" }],
    setBulkCapacity: noop,
    setBulkCapacityDraft: noop,
    setBulkDays: noop,
    setBulkEndDate: noop,
    setBulkEndTime: noop,
    setBulkLocation: noop,
    setBulkNotes: noop,
    setBulkRangeEnd: noop,
    setBulkRangeStart: noop,
    setBulkStartDate: noop,
    setBulkTime: noop,
    setError: noop,
    setNewSessionCapacity: noop,
    setNewSessionDate: noop,
    setNewSessionDateObj: noop,
    setNewSessionDayOfWeek: noop,
    setNewSessionEndTime: noop,
    setNewSessionLabel: noop,
    setNewSessionLocation: noop,
    setNewSessionNotes: noop,
    setNewSessionSection: noop,
    setNewSessionTime: noop,
    setPendingReplaceCount: noop,
    setRescheduleCapacity: noop,
    setRescheduleCapacityDraft: noop,
    setSessions: noop,
    setShowAddSession: noop,
    setShowBulk: noop,
    setShowReschedule: noop,
    setShowRescheduleConfirm: noop,
    setShowToast: noop,
    setSignupCount: noop,
    setTithingCapacity: noop,
    setTithingCapacityDraft: noop,
    setToastMessage: noop,
    signupCount: 0,
    tithingCapacity: 1,
    tithingCapacityDraft: undefined,
    tithingDays: [0],
    tithingDuration: 15,
    ...overrides,
  } as any;
}

describe("Apply stages a replace and does not toast", () => {
  it("sets the pending count and does not show a Rescheduled toast", () => {
    const setPendingReplaceCount = jest.fn();
    const setSessions = jest.fn();
    const setShowToast = jest.fn();
    const setToastMessage = jest.fn();
    const setShowReschedule = jest.fn();
    const { result } = renderHook(() =>
      useScheduleBuilders(
        buildersCtx({
          setPendingReplaceCount,
          setSessions,
          setShowToast,
          setToastMessage,
          setShowReschedule,
        }),
      ),
    );

    act(() => {
      result.current.commitReschedule();
    });

    // Mon Nov 16 through Fri Nov 20, weekdays 1-5 => 5 slots
    expect(setSessions).toHaveBeenCalledTimes(1);
    const staged = setSessions.mock.calls[0][0];
    expect(staged).toHaveLength(5);
    expect(setPendingReplaceCount).toHaveBeenCalledWith(5);
    expect(setShowReschedule).toHaveBeenCalledWith(false);
    expect(setShowToast).not.toHaveBeenCalled();
    expect(setToastMessage).not.toHaveBeenCalled();
  });

  it("uses singular count when Apply creates 1 slot", () => {
    const setPendingReplaceCount = jest.fn();
    const { result } = renderHook(() =>
      useScheduleBuilders(
        buildersCtx({
          setPendingReplaceCount,
          rescheduleStart: new Date(2026, 10, 16),
          rescheduleEnd: new Date(2026, 10, 16),
          rescheduleDays: [1],
        }),
      ),
    );

    act(() => {
      result.current.commitReschedule();
    });

    expect(setPendingReplaceCount).toHaveBeenCalledWith(1);
  });
});

const EVENT = "11111111-1111-4111-8111-111111111111";
const slot = (id?: string) => ({
  id,
  day_of_week: 1,
  time: "17:00",
  end_time: "18:00",
  capacity: 2,
  location: "",
  notes: "",
  session_date: "2026-11-16",
});

type Result = { data?: unknown; error: unknown; count?: number };
function chain(result: Result) {
  const q: any = {
    select: () => q,
    eq: () => q,
    in: () => q,
    order: () => q,
    then: (res: (r: Result) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  };
  return q;
}

const reloaded = [
  {
    id: "new-1",
    campaign_id: EVENT,
    day_of_week: 1,
    time: "17:00",
    end_time: "18:00",
    capacity: 2,
    location: "",
    notes: "",
    session_date: "2026-11-16",
  },
];

jest.mock("@/lib/event-page-expire-client", () => ({
  expirePublicEventPage: async () => true,
}));

jest.mock("@/lib/auth", () => ({
  createClientComponentClient: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: "tok" } } }) },
    from: () => ({
      select: () =>
        chain({ data: reloaded, error: null, count: 0 }),
      upsert: () => chain({ error: null }),
      insert: () => chain({ error: null }),
      delete: () => chain({ error: null }),
    }),
  }),
}));

function saveCtx(overrides: Record<string, unknown> = {}) {
  const noop = () => {};
  return {
    allowDestructiveDeletesOnceRef: { current: true },
    pendingDeleteSessionIdsRef: { current: [] },
    error: null,
    eventDescription: "",
    eventId: EVENT,
    eventName: "Tithing Declaration",
    eventTimezone: "America/Phoenix",
    sessions: [slot()],
    loadedSessionIds: [],
    pendingReplaceCount: 1,
    router: { replace: noop },
    setCapacityInputDraft: noop,
    setDeleteSessionsSignupCount: noop,
    setError: noop,
    setItemsError: noop,
    setItemsSaving: noop,
    setLastSavedAt: noop,
    setLoadedSessionIds: noop,
    setPendingReplaceCount: noop,
    setSavedSnapshot: noop,
    setSaving: noop,
    setSessions: noop,
    setShowDeleteSessionsConfirm: noop,
    setShowToast: noop,
    setSignupCount: noop,
    setSignupsBySession: noop,
    setToastMessage: noop,
    ...overrides,
  } as any;
}

describe("save toast after a staged replace", () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
  });

  it("shows Saved. N slots are live. and clears the staged flag", async () => {
    const setToastMessage = jest.fn();
    const setShowToast = jest.fn();
    const setPendingReplaceCount = jest.fn();
    const { result } = renderHook(() =>
      useSaveEditEvent(
        saveCtx({ setToastMessage, setShowToast, setPendingReplaceCount, pendingReplaceCount: 1 }),
      ),
    );
    await act(async () => {
      await result.current.performSave();
    });
    expect(setToastMessage).toHaveBeenCalledWith("Saved. 1 slot is live.");
    expect(setShowToast).toHaveBeenCalledWith(true);
    expect(setPendingReplaceCount).toHaveBeenCalledWith(null);
  });

  it("keeps the generic Changes saved toast when no replace is staged", async () => {
    const setToastMessage = jest.fn();
    const setPendingReplaceCount = jest.fn();
    const { result } = renderHook(() =>
      useSaveEditEvent(
        saveCtx({
          setToastMessage,
          setPendingReplaceCount,
          pendingReplaceCount: null,
          sessions: [slot("existing")],
          loadedSessionIds: ["existing"],
        }),
      ),
    );
    await act(async () => {
      await result.current.performSave();
    });
    expect(setToastMessage).toHaveBeenCalledWith("Changes saved");
    expect(setPendingReplaceCount).not.toHaveBeenCalled();
  });
});

describe("SessionsList staged banner", () => {
  const baseListCtx = {
    addClassToDate: () => {},
    capacityInputDraft: {},
    commitCapacityDraft: () => {},
    dragOverIndex: null,
    draggingIndex: null,
    editingSessionIndex: null,
    eventEndDate: null,
    highlightDate: null,
    reorderGroupKey: null,
    reorderSlot: () => {},
    setCapacityInputDraft: () => {},
    setDayMenuButtonEl: () => {},
    setDayMenuGroupKey: () => {},
    setDayMenuSecondStep: () => {},
    setDayMenuSecondStepDate: () => {},
    setDragOverIndex: () => {},
    setDraggingIndex: () => {},
    setEditingSessionIndex: () => {},
    setReorderGroupKey: () => {},
    setSectionMenu: () => {},
    setSectionMenuButtonEl: () => {},
    setSectionMenuStep: () => {},
    setSectionRenameDraft: () => {},
    setSlotMenuButtonEl: () => {},
    setSlotMenuIndex: () => {},
    signupsBySession: {},
    updateSession: () => {},
  };

  it("shows the not-saved banner with pluralized count after Apply", () => {
    render(
      <SessionsList
        ctx={{
          ...baseListCtx,
          pendingReplaceCount: 6,
          sessions: Array.from({ length: 6 }, (_, i) => ({
            day_of_week: 1,
            time: "15:30",
            end_time: "15:45",
            capacity: 1,
            location: "",
            notes: "",
            session_date: "2026-11-16",
            id: `s${i}`,
          })),
        } as any}
      />,
    );
    expect(screen.getByTestId("staged-replace-banner")).toHaveTextContent(
      "Not saved yet. Save to make these 6 slots live.",
    );
  });

  it("does not show the banner when nothing is staged", () => {
    render(
      <SessionsList
        ctx={{
          ...baseListCtx,
          pendingReplaceCount: null,
          sessions: [
            {
              day_of_week: 1,
              time: "15:30",
              end_time: "15:45",
              capacity: 1,
              location: "",
              notes: "",
              session_date: "2026-11-16",
              id: "s1",
            },
          ],
        } as any}
      />,
    );
    expect(screen.queryByTestId("staged-replace-banner")).not.toBeInTheDocument();
  });
});
