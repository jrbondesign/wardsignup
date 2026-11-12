/**
 * @jest-environment node
 *
 * New events and duplicates default the "I'm also bringing…" box on.
 * A duplicate of an event with the box off keeps it off.
 */
import { NextRequest } from "next/server";
import { POST as POST_CREATE } from "@/app/api/events/route";
import { POST as POST_DUPLICATE } from "@/app/api/events/[id]/duplicate/route";
import { getAuthFromRequest } from "@/lib/auth";
import { getCurrentOrganization } from "@/lib/organizations";
import { checkEventLimit } from "@/lib/event-limit";
import { ensureOrganizerBrandMatchesHost } from "@/lib/organizer-profile";
import { userCanAdminCampaign } from "@/lib/campaign-access";

jest.mock("@/lib/auth", () => ({ getAuthFromRequest: jest.fn() }));
jest.mock("@/lib/organizations", () => {
  const actual = jest.requireActual("@/lib/organizations");
  return { ...actual, getCurrentOrganization: jest.fn(), listUserOrganizations: jest.fn() };
});
jest.mock("@/lib/event-limit", () => ({ checkEventLimit: jest.fn() }));
jest.mock("@/lib/organizer-profile", () => {
  const actual = jest.requireActual("@/lib/organizer-profile");
  return { ...actual, ensureOrganizerBrandMatchesHost: jest.fn() };
});
jest.mock("@/lib/campaign-access", () => ({
  userCanAdminCampaign: jest.fn(),
  userCanDeleteCampaign: jest.fn(),
}));
jest.mock("@/lib/campaign-brand-guard", () => ({ campaignMatchesHostBrand: () => true }));
jest.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: jest.fn() }),
  captureServerException: jest.fn(),
}));
jest.mock("@/lib/founder-notify", () => ({ notifyFounderIfFirstEvent: jest.fn() }));

const mockGetAuth = getAuthFromRequest as jest.MockedFunction<typeof getAuthFromRequest>;
const mockGetOrg = getCurrentOrganization as jest.MockedFunction<typeof getCurrentOrganization>;
const mockLimit = checkEventLimit as jest.MockedFunction<typeof checkEventLimit>;
const mockBrandGate = ensureOrganizerBrandMatchesHost as jest.MockedFunction<typeof ensureOrganizerBrandMatchesHost>;
const mockCanAdmin = userCanAdminCampaign as jest.MockedFunction<typeof userCanAdminCampaign>;

const SOURCE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const NEW_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function insertMock(row: Record<string, unknown> = {}) {
  const insert = jest.fn(() => ({
    select: jest.fn(() => ({
      single: jest.fn(() => Promise.resolve({ data: { id: NEW_ID, name: "Copy", ...row }, error: null })),
    })),
  }));
  return insert;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetOrg.mockResolvedValue({ id: "org-1", name: "Test Org" } as never);
  mockLimit.mockResolvedValue({ ok: true } as never);
  mockBrandGate.mockResolvedValue({ ok: true } as never);
  mockCanAdmin.mockResolvedValue(true);
});

describe("POST /api/events default for allow_custom_items", () => {
  function authWithInsert(insert: jest.Mock) {
    mockGetAuth.mockResolvedValue({
      ok: true,
      supabase: {
        from: jest.fn((table: string) => {
          if (table === "campaigns") return { insert };
          return {};
        }),
      } as never,
      user: { id: "user-1", email: "test@example.com" } as never,
    });
  }

  it("writes true for a new event", async () => {
    const insert = insertMock();
    authWithInsert(insert);
    const res = await POST_CREATE(
      new NextRequest("http://localhost:3000/api/events", {
        method: "POST",
        body: JSON.stringify({ name: "Potluck", event_type: "items" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ allow_custom_items: true }));
  });

  it("still writes true if a client tries to create with the box off", async () => {
    const insert = insertMock();
    authWithInsert(insert);
    const res = await POST_CREATE(
      new NextRequest("http://localhost:3000/api/events", {
        method: "POST",
        body: JSON.stringify({ name: "Potluck", event_type: "items", allow_custom_items: false }),
      }),
    );
    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ allow_custom_items: true }));
  });
});

describe("POST /api/events/[id]/duplicate allow_custom_items", () => {
  function sourceRow(allow: boolean | null | "missing") {
    const row: Record<string, unknown> = {
      id: SOURCE_ID,
      name: "Potluck",
      description: null,
      brand_id: "wardsignup",
      public_host: "wardsignup.com",
      organization_id: "org-1",
      organizer_digest_enabled: true,
      organizer_instant_notify_enabled: false,
      leader_signup_email_enabled: false,
      event_timezone: "America/Phoenix",
      show_signups_publicly: true,
      cover_image_url: null,
      event_type: "items",
      allow_guests: false,
      show_capacity_publicly: true,
      list_on_directory: true,
      event_date: "2026-12-13",
      event_end_date: null,
      event_start_time: null,
      event_end_time: null,
      event_times: [],
      event_locations: [],
      event_dates: [],
    };
    if (allow !== "missing") row.allow_custom_items = allow;
    return row;
  }

  function childrenQuery() {
    const q: Record<string, unknown> = {};
    const done = Promise.resolve({ data: [], error: null });
    for (const m of ["select", "eq", "order"]) q[m] = () => q;
    q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => done.then(res, rej);
    return q;
  }

  async function duplicate(allow: boolean | null | "missing") {
    const insert = insertMock({ name: "Copy of Potluck" });
    const source = sourceRow(allow);
    mockGetAuth.mockResolvedValue({
      ok: true,
      supabase: {
        from: jest.fn((table: string) => {
          if (table === "campaigns") {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn(() => Promise.resolve({ data: source, error: null })),
                })),
              })),
              insert,
            };
          }
          return childrenQuery();
        }),
      } as never,
      user: { id: "user-1", email: "test@example.com" } as never,
    });
    const res = await POST_DUPLICATE(
      new NextRequest(`http://localhost:3000/api/events/${SOURCE_ID}/duplicate`, {
        method: "POST",
        body: JSON.stringify({ name: "Copy of Potluck" }),
      }),
      { params: Promise.resolve({ id: SOURCE_ID }) },
    );
    return { res, insert };
  }

  it.each([true, null, "missing" as const])("copies the box as on when the source is %p", async (allow) => {
    const { res, insert } = await duplicate(allow);
    expect(res.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ allow_custom_items: true }));
  });

  it("copies the box as off when the source has it off", async () => {
    const { res, insert } = await duplicate(false);
    expect(res.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ allow_custom_items: false }));
  });
});
