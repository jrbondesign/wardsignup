/**
 * "Show signups publicly" off: nothing that identifies a signer reaches an
 * anonymous visitor (server HTML, serialized page props, the shared cache, or
 * the browser refresh), while counts used for capacity stay. Public events and
 * the organizer view are unchanged. Names below are made up sentinels.
 */
import { readFileSync } from "fs";
import path from "path";
import { render, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom";

const mockPosthog = { capture: jest.fn(), identify: jest.fn() };
jest.mock("posthog-js/react", () => ({ usePostHog: () => mockPosthog }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock("next/image", () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ priority, fill, ...props }: Record<string, unknown>) => <img {...(props as object)} />,
}));
jest.mock("react", () => ({ ...jest.requireActual("react"), cache: (fn: unknown) => fn }));
// Record what goes into the shared cross-request cache.
jest.mock("next/cache", () => {
  const state = { stored: [] as unknown[], keys: [] as unknown[] };
  return {
    __state: state,
    unstable_cache:
      (fn: (...a: unknown[]) => Promise<unknown>, keyParts: string[]) =>
      async (...a: unknown[]) => {
        state.keys.push(keyParts);
        const v = await fn(...a);
        state.stored.push(v);
        return v;
      },
    revalidateTag: jest.fn(),
  };
});
// The server loader's Supabase client: answers like a database whose views
// regressed and returned names, so the app layer has to strip them.
jest.mock("@supabase/supabase-js", () => {
  const state = { payload: null as unknown, createArgs: [] as unknown[] };
  return {
    __state: state,
    createClient: (...args: unknown[]) => {
      state.createArgs.push(args);
      return { rpc: async () => ({ data: state.payload, error: null }), from: () => ({}) };
    },
  };
});
const mockServiceRole = jest.fn(() => ({}));
jest.mock("@/lib/supabase-admin", () => ({ createServiceRoleClient: () => mockServiceRole() }));
jest.mock("@/lib/event-media", () => ({ publicCoverForCampaign: async () => null }));
const mockBrowserRpc = jest.fn();
jest.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => mockBrowserRpc(...a), from: () => ({}) } }));

import { buildPublicEventPage, loadPublicEventPage, redactHiddenSignups, resetPublicEventPageRpcCache, type PublicEventClient, type PublicEventPagePayload } from "@/lib/public-event-page";
import { getServerEventSnapshot } from "@/lib/public-event-page-server";
import EventPageClient from "@/components/event/EventPageClient";
import { BrandProvider } from "@/components/BrandProvider";
import { getDefaultPublicBrand } from "@/lib/brand";

const cacheState = (jest.requireMock("next/cache") as { __state: { stored: unknown[]; keys: string[][] } }).__state;
const dbState = (jest.requireMock("@supabase/supabase-js") as { __state: { payload: unknown; createArgs: unknown[][] } }).__state;

const ID = "11111111-1111-1111-1111-111111111111";
const SECRETS = ["Zed Sentinelname", "Qa Guestsentinel", "sentinel note text", "Sentinel Pie", "sig-real-uuid-1", "sig-real-uuid-2", "isig-real-1", "isig-real-2"];

function spotsPayload(show: boolean | null): PublicEventPagePayload {
  return {
    event: { id: ID, name: "Service Night", description: null, event_type: "spots", show_signups_publicly: show },
    sessions: [{ id: "s1", campaign_id: ID, capacity: 2, session_date: "2099-01-10", time: "09:00" }] as never,
    signups: [
      { id: "sig-real-uuid-1", session_id: "s1", member_name: "Zed Sentinelname", signup_note: "sentinel note text", guest_names: ["Qa Guestsentinel"] },
      { id: "sig-real-uuid-2", session_id: "s1", member_name: "Zed Sentinelname", signup_note: null, guest_names: null },
    ],
  };
}
function itemsPayload(show: boolean): PublicEventPagePayload {
  return {
    event: { id: ID, name: "Potluck", description: null, event_type: "items", show_signups_publicly: show },
    items: [{ id: "i1", campaign_id: ID, label: "Rolls", item_limit: 5, section: null, sort_order: 1, created_at: "" }] as never,
    item_signups: [
      { id: "isig-real-1", item_id: "i1", member_name: "Zed Sentinelname", custom_label: null, signup_note: "sentinel note text", quantity: 3 },
      { id: "isig-real-2", item_id: null, member_name: "Zed Sentinelname", custom_label: "Sentinel Pie", signup_note: null, quantity: 2 },
    ],
  };
}
const leaks = (v: unknown) => SECRETS.filter((s) => JSON.stringify(v).includes(s));

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-for-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key-for-test";
  resetPublicEventPageRpcCache();
  cacheState.stored.length = 0;
  cacheState.keys.length = 0;
  dbState.createArgs.length = 0;
  mockServiceRole.mockClear();
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
});

describe("(a) hidden signups: no names for a logged out viewer", () => {
  it.each([false, null])("redacts spots signups (flag %p) but keeps the headcount", (flag) => {
    const page = buildPublicEventPage(spotsPayload(flag))!;
    expect(leaks(page)).toEqual([]);
    expect(page.sessions[0].signups).toHaveLength(2);
    expect(page.sessions[0].signups?.[0]).toEqual({ id: "hidden-1", member_name: "", signup_note: null, guest_names: [] });
  });

  it("redacts item and custom signups but keeps quantities", () => {
    const page = buildPublicEventPage(itemsPayload(false))!;
    expect(leaks(page)).toEqual([]);
    expect((page.items[0].item_signups as unknown as { quantity: number }[]).map((s) => s.quantity)).toEqual([3]);
    expect(page.customSignups.map((s) => s.quantity)).toEqual([2]);
  });

  it("the server loader stores and returns only the redacted shape", async () => {
    dbState.payload = spotsPayload(false);
    const snap = await getServerEventSnapshot(ID);
    expect(snap?.page.sessions[0].signups).toHaveLength(2);
    expect(leaks(snap)).toEqual([]);
    expect(cacheState.stored).toHaveLength(1);
    expect(leaks(cacheState.stored)).toEqual([]);
  });

  it("the browser refresh path (direct RPC and legacy fallback) gets the redacted shape", async () => {
    mockBrowserRpc.mockResolvedValueOnce({ data: itemsPayload(false), error: null });
    const { supabase } = jest.requireMock("@/lib/supabase") as { supabase: PublicEventClient };
    expect(leaks(await loadPublicEventPage(supabase, ID))).toEqual([]);

    const legacyRows: Record<string, unknown> = {
      sessions: spotsPayload(false).sessions,
      signups_public: spotsPayload(false).signups,
    };
    const q = (data: unknown) => {
      const o: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order"]) o[m] = () => o;
      o.then = (r: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(r);
      return o;
    };
    const legacy = {
      rpc: async (fn: string) =>
        fn === "get_public_campaign" ? { data: [spotsPayload(false).event], error: null } : { data: null, error: { message: "down" } },
      from: (t: string) => q(legacyRows[t] ?? []),
    } as unknown as PublicEventClient;
    expect(leaks(await loadPublicEventPage(legacy, ID))).toEqual([]);
  });

  it("server props (what the RSC payload serializes) and the hydrated page have no names", async () => {
    const page = buildPublicEventPage(spotsPayload(false))!;
    // Full single slot, so the "Signed up" list would render if names were public.
    page.sessions[0].capacity = 2;
    expect(leaks({ initialPage: page })).toEqual([]);
    const { container } = render(
      <BrandProvider brand={getDefaultPublicBrand()}>
        <EventPageClient eventId={ID} initialPage={page} initialCover={null} />
      </BrandProvider>
    );
    await act(async () => {});
    expect(await screen.findByText(/This event is full/)).toBeInTheDocument();
    expect(leaks(container.innerHTML)).toEqual([]);
  });
});

describe("(b) public signups: unchanged", () => {
  it("keeps names, notes, guests and ids", () => {
    const page = buildPublicEventPage(spotsPayload(true))!;
    expect(page.sessions[0].signups?.[0]).toEqual({
      id: "sig-real-uuid-1",
      member_name: "Zed Sentinelname",
      signup_note: "sentinel note text",
      guest_names: ["Qa Guestsentinel"],
    });
    const items = buildPublicEventPage(itemsPayload(true))!;
    expect(items.customSignups[0]).toEqual({ id: "isig-real-2", member_name: "Zed Sentinelname", custom_label: "Sentinel Pie", signup_note: null, quantity: 2 });
    expect(redactHiddenSignups(page)).toBe(page);
  });

  it("still shows the Signed up list on the page", async () => {
    const page = buildPublicEventPage(spotsPayload(true))!;
    render(
      <BrandProvider brand={getDefaultPublicBrand()}>
        <EventPageClient eventId={ID} initialPage={page} initialCover={null} />
      </BrandProvider>
    );
    expect((await screen.findAllByText("Zed Sentinelname")).length).toBeGreaterThan(0);
  });
});

describe("(c) organizer view: unchanged", () => {
  it("admin and edit loaders never go through the redacted public page loader", () => {
    const root = path.join(__dirname, "..");
    for (const f of ["components/admin/hooks/useLoadAdminEvent.ts", "app/api/items/route.ts"]) {
      expect(readFileSync(path.join(root, f), "utf8")).not.toMatch(/public-event-page/);
    }
  });
});

describe("(d) the shared cache cannot hold organizer data", () => {
  it("is filled by a cookie-less anon client, never the service role, with no viewer in the key", async () => {
    dbState.payload = spotsPayload(false);
    await getServerEventSnapshot(ID);
    expect(mockServiceRole).not.toHaveBeenCalled();
    expect(dbState.createArgs).toHaveLength(1);
    const [, key, opts] = dbState.createArgs[0] as [string, string, { auth: { persistSession: boolean } }];
    expect(key).toBe("anon-key-for-test");
    expect(opts.auth.persistSession).toBe(false);
    expect(cacheState.keys[0]).toEqual(expect.arrayContaining([ID]));
    expect(cacheState.keys[0]).toHaveLength(2);
  });
});
