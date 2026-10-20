import {
  buildPublicEventPage,
  loadPublicEventPage,
  resetPublicEventPageRpcCache,
  type PublicEventClient,
} from "@/lib/public-event-page";

const EVENT_ID = "11111111-1111-1111-1111-111111111111";

/** Chainable fake for supabase.from(...).select().eq().order()... that resolves to `result`. */
function query(result: { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) q[m] = jest.fn(() => q);
  q.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

function fakeClient(opts: {
  rpc: Record<string, { data: unknown; error: unknown }>;
  tables?: Record<string, { data: unknown; error: unknown }>;
}) {
  const rpc = jest.fn((fn: string) => Promise.resolve(opts.rpc[fn] ?? { data: null, error: { code: "PGRST202" } }));
  const from = jest.fn((table: string) => query(opts.tables?.[table] ?? { data: [], error: null }));
  return { client: { rpc, from } as unknown as PublicEventClient, rpc, from };
}

const spotsEvent = { id: EVENT_ID, name: "Ev", description: null, event_type: "spots", show_signups_publicly: true };
const session = (id: string) => ({ id, campaign_id: EVENT_ID, capacity: 2, session_date: "2026-11-01" });

beforeEach(() => resetPublicEventPageRpcCache());

describe("buildPublicEventPage", () => {
  it("returns null without an event", () => {
    expect(buildPublicEventPage({ event: null })).toBeNull();
  });

  it("attaches public signups to their sessions and defaults guest_names", () => {
    const page = buildPublicEventPage({
      event: spotsEvent,
      sessions: [session("s1"), session("s2")] as never,
      signups: [
        { id: "u1", session_id: "s1", member_name: "Ann", signup_note: null, guest_names: null },
        { id: "u2", session_id: "s1", member_name: "Bo", signup_note: "hi", guest_names: ["G"] },
      ],
    })!;
    expect(page.eventType).toBe("spots");
    expect(page.sessions.map((s) => s.signups?.length)).toEqual([2, 0]);
    expect(page.sessions[0].signups?.[0]).toEqual({ id: "u1", member_name: "Ann", signup_note: null, guest_names: [] });
  });

  it("splits item signups into per item lists and custom rows", () => {
    const page = buildPublicEventPage({
      event: { ...spotsEvent, event_type: "items" },
      items: [{ id: "i1", campaign_id: EVENT_ID, label: "A", item_limit: null, section: null, sort_order: 1, created_at: "" }] as never,
      item_signups: [
        { id: "x1", item_id: "i1", member_name: "Cy", custom_label: null, signup_note: null, quantity: 2 },
        { id: "x2", item_id: null, member_name: "Di", custom_label: "Pie", signup_note: null, quantity: 1 },
      ],
    })!;
    expect(page.eventType).toBe("items");
    expect(page.items[0].item_signups).toHaveLength(1);
    expect(page.customSignups).toEqual([
      { id: "x2", member_name: "Di", custom_label: "Pie", signup_note: null, quantity: 1 },
    ]);
  });
});

describe("loadPublicEventPage", () => {
  it("uses the single RPC and makes no table reads when it exists", async () => {
    const { client, rpc, from } = fakeClient({
      rpc: {
        get_public_event_page: {
          data: { event: spotsEvent, sessions: [session("s1")], signups: [], items: [], item_signups: [] },
          error: null,
        },
      },
    });
    const page = await loadPublicEventPage(client, EVENT_ID);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_public_event_page", { campaign_id: EVENT_ID });
    expect(from).not.toHaveBeenCalled();
    expect(page?.sessions).toHaveLength(1);
  });

  it("returns null when the RPC finds no event", async () => {
    const { client, from } = fakeClient({ rpc: { get_public_event_page: { data: null, error: null } } });
    expect(await loadPublicEventPage(client, EVENT_ID)).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("falls back to the old public path when the RPC is missing, and remembers it", async () => {
    const { client, rpc, from } = fakeClient({
      rpc: {
        get_public_event_page: { data: null, error: { code: "PGRST202", message: "not found" } },
        get_public_campaign: { data: [spotsEvent], error: null },
      },
      tables: {
        sessions: { data: [session("s1")], error: null },
        signups_public: {
          data: [{ id: "u1", session_id: "s1", member_name: "Ann", signup_note: null, guest_names: [] }],
          error: null,
        },
      },
    });
    const page = await loadPublicEventPage(client, EVENT_ID);
    expect(page?.sessions[0].signups).toHaveLength(1);
    expect(from.mock.calls.map((c) => c[0]).sort()).toEqual(["sessions", "signups_public"]);

    rpc.mockClear();
    await loadPublicEventPage(client, EVENT_ID);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["get_public_campaign"]);

    // Retries the RPC after the back off, so a migration applied later is picked up.
    const now = Date.now();
    const spy = jest.spyOn(Date, "now").mockReturnValue(now + 6 * 60 * 1000);
    rpc.mockClear();
    await loadPublicEventPage(client, EVENT_ID);
    expect(rpc.mock.calls[0][0]).toBe("get_public_event_page");
    spy.mockRestore();
  });

  it("legacy items path reads only campaign_items and item_signups_public", async () => {
    const { client, from } = fakeClient({
      rpc: {
        get_public_event_page: { data: null, error: { code: "42883" } },
        get_public_campaign: { data: [{ ...spotsEvent, event_type: "items" }], error: null },
      },
    });
    const page = await loadPublicEventPage(client, EVENT_ID);
    expect(page?.eventType).toBe("items");
    expect(from.mock.calls.map((c) => c[0]).sort()).toEqual(["campaign_items", "item_signups_public"]);
  });

  it("throws when the fallback path errors", async () => {
    const { client } = fakeClient({
      rpc: {
        get_public_event_page: { data: null, error: { code: "PGRST202" } },
        get_public_campaign: { data: null, error: { message: "boom" } },
      },
    });
    await expect(loadPublicEventPage(client, EVENT_ID)).rejects.toEqual({ message: "boom" });
  });
});
