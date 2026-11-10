/**
 * The edit page writes slots straight to Supabase from the browser, so it must
 * ask the server to expire the public event page cache after a slot save
 * (add, edit/reorder, delete), even when a later step fails.
 */
import { renderHook, act } from "@testing-library/react";

const mockExpire = jest.fn(async () => true);
jest.mock("@/lib/event-page-expire-client", () => ({
  expirePublicEventPage: (...a: unknown[]) => mockExpire(...(a as [])),
}));

type Result = { data?: unknown; error: unknown; count?: number };
let insertResult: Result = { error: null };
const writes: string[] = [];

function chain(result: Result) {
  const q: any = {
    select: () => q,
    eq: () => q,
    in: () => q,
    order: () => q,
    then: (res: (r: Result) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej),
  };
  return q;
}

const fakeSupabase = {
  auth: { getSession: async () => ({ data: { session: { access_token: "tok" } } }) },
  from: () => ({
    select: () => chain({ data: [], error: null, count: 0 }),
    upsert: () => {
      writes.push("upsert");
      return chain({ error: null });
    },
    insert: () => {
      writes.push("insert");
      return chain(insertResult);
    },
    delete: () => {
      writes.push("delete");
      return chain({ error: null });
    },
  }),
};
jest.mock("@/lib/auth", () => ({ createClientComponentClient: () => fakeSupabase }));

import { useSaveEditEvent } from "@/components/edit/hooks/useSaveEditEvent";

const EVENT = "11111111-1111-4111-8111-111111111111";
const slot = (id?: string) => ({ id, day_of_week: 0, time: "10:00", capacity: 2, location: "", notes: "" });

function ctx(sessions: ReturnType<typeof slot>[], loadedSessionIds: string[]) {
  const noop = () => {};
  return {
    allowDestructiveDeletesOnceRef: { current: true },
    pendingDeleteSessionIdsRef: { current: [] },
    error: null,
    eventDescription: "",
    eventId: EVENT,
    eventName: "Clean the building",
    eventTimezone: "America/Phoenix",
    sessions,
    loadedSessionIds,
    router: { replace: noop },
    setCapacityInputDraft: noop,
    setDeleteSessionsSignupCount: noop,
    setError: noop,
    setItemsError: noop,
    setItemsSaving: noop,
    setLastSavedAt: noop,
    setLoadedSessionIds: noop,
    setSavedSnapshot: noop,
    setSaving: noop,
    setSessions: noop,
    setShowDeleteSessionsConfirm: noop,
    setShowToast: noop,
    setSignupCount: noop,
    setSignupsBySession: noop,
    setToastMessage: noop,
  } as any;
}

beforeEach(() => {
  mockExpire.mockClear();
  writes.length = 0;
  insertResult = { error: null };
  (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
});

describe("edit page slot save expires the public event page", () => {
  it("expires the event's cache after edit + add + delete", async () => {
    const { result } = renderHook(() => useSaveEditEvent(ctx([slot("a"), slot()], ["a", "gone"])));
    await act(async () => {
      await result.current.performSave();
    });
    expect(writes).toEqual(["upsert", "insert", "delete"]);
    expect(mockExpire).toHaveBeenCalledTimes(1);
    expect(mockExpire).toHaveBeenCalledWith(EVENT, "tok");
  });

  it("still expires it when a later slot write fails after an earlier one landed", async () => {
    insertResult = { error: { message: "boom" } };
    const { result } = renderHook(() => useSaveEditEvent(ctx([slot("a"), slot()], ["a"])));
    await act(async () => {
      await result.current.performSave();
    });
    expect(writes).toEqual(["upsert", "insert"]);
    expect(mockExpire).toHaveBeenCalledWith(EVENT, "tok");
  });

  it("does not call it when no slot row was written", async () => {
    const { result } = renderHook(() => useSaveEditEvent(ctx([], [])));
    await act(async () => {
      await result.current.performSave();
    });
    expect(writes).toEqual([]);
    expect(mockExpire).not.toHaveBeenCalled();
  });
});
