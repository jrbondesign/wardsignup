/**
 * @jest-environment node
 */

jest.mock("@/lib/email-send", () => ({
  sendGuardedEmail: jest.fn(async () => ({ ok: true })),
}));
jest.mock("@/lib/supabase-admin", () => ({ createServiceRoleClient: jest.fn() }));

import fs from "fs";
import path from "path";
import { sendGuardedEmail } from "@/lib/email-send";
import { getDefaultPublicBrand } from "@/lib/brand";
import {
  CONNECTION_BROKEN_ERROR,
  GoogleAuthError,
  buildCreatorReconnectEmail,
  clearConnectionBroken,
  isConnectionBroken,
  isGoogleAuthFailure,
  markConnectionBroken,
  reconnectUrl,
} from "@/lib/google-calendar-health";
import {
  RECONNECT_BANNER_BODY,
  RECONNECT_BANNER_BUTTON,
  RECONNECT_BANNER_TITLE,
} from "@/components/event/ReconnectGoogleBanner";

const mockSend = sendGuardedEmail as jest.MockedFunction<typeof sendGuardedEmail>;

type Call = { table: string; method: string; args: unknown[] };

/** Fake admin with a single connection row whose status flips on the guarded update. */
function fakeAdmin(initialStatus: "active" | "broken", opts: { statusError?: boolean } = {}) {
  const calls: Call[] = [];
  const state = { status: initialStatus };
  const admin = {
    auth: { admin: { getUserById: jest.fn(async () => ({ data: { user: { email: "creator@example.com" } } })) } },
    from(table: string) {
      const ctx: { update?: any; eqs: Array<[string, unknown]>; select?: string } = { eqs: [] };
      const chain: any = {
        update(row: unknown) { ctx.update = row; calls.push({ table, method: "update", args: [row] }); return chain; },
        select(cols: string) { ctx.select = cols; return chain; },
        eq(col: string, val: unknown) { ctx.eqs.push([col, val]); return chain; },
        limit() { return chain; },
        maybeSingle() {
          return Promise.resolve({ data: table === "campaigns" ? { id: "c1", name: "Missionary Dinners", brand_id: null, public_host: null } : null, error: null });
        },
        then(resolve: (v: unknown) => unknown) {
          if (table === "google_calendar_connections" && ctx.update?.status === "broken") {
            if (opts.statusError) return Promise.resolve({ data: null, error: { message: "column status does not exist" } }).then(resolve);
            const guard = ctx.eqs.find(([c]) => c === "status");
            if (guard && state.status === guard[1]) {
              state.status = "broken";
              return Promise.resolve({ data: [{ id: "conn1", user_id: "u1", organization_id: "o1", google_email: "g@example.com" }], error: null }).then(resolve);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve);
          }
          if (table === "google_calendar_connections" && ctx.update?.status === "active") state.status = "active";
          if (table === "campaign_calendar_sync" && ctx.select) {
            return Promise.resolve({ data: [{ campaign_id: "c1" }], error: null }).then(resolve);
          }
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return chain;
    },
  };
  return { admin, calls, state };
}

beforeEach(() => {
  mockSend.mockClear();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

describe("isGoogleAuthFailure", () => {
  it("detects invalid_grant, revoked/expired tokens, and 401s", () => {
    expect(isGoogleAuthFailure(new Error('Token refresh failed: {"error":"invalid_grant"}'))).toBe(true);
    expect(isGoogleAuthFailure(new Error("Token has been expired or revoked."))).toBe(true);
    expect(isGoogleAuthFailure(new GoogleAuthError("Failed to create event (401)"))).toBe(true);
    expect(isGoogleAuthFailure(new Error("whatever"), 401)).toBe(true);
  });
  it("ignores ordinary failures", () => {
    expect(isGoogleAuthFailure(new Error("Failed to create event: rateLimitExceeded"))).toBe(false);
    expect(isGoogleAuthFailure(new Error("Google OAuth credentials not configured"))).toBe(false);
  });
});

describe("isConnectionBroken", () => {
  it("uses status, falling back to legacy invalid_grant marker", () => {
    expect(isConnectionBroken({ status: "broken" })).toBe(true);
    expect(isConnectionBroken({ status: "active", last_error: null })).toBe(false);
    expect(isConnectionBroken({ revoked_at: "x", last_error: "Invalid grant - reauthorization needed" })).toBe(true);
    expect(isConnectionBroken(null)).toBe(false);
  });
});

describe("copy", () => {
  it("reconnect link points at the event admin page", () => {
    expect(reconnectUrl("https://wardsignup.com/", "abc")).toBe("https://wardsignup.com/admin/abc?reconnect_google=1");
  });
  it("creator email and banner copy contain no dashes", () => {
    const mail = buildCreatorReconnectEmail({ brand: getDefaultPublicBrand(), eventName: "Dinners", googleEmail: "g@example.com", link: "https://x/y" });
    for (const text of [mail.subject, mail.text, RECONNECT_BANNER_TITLE, RECONNECT_BANNER_BODY, RECONNECT_BANNER_BUTTON]) {
      expect(text).not.toMatch(/[\u2012\u2013\u2014\u2015]| - /);
    }
    expect(mail.text).toContain("https://x/y");
  });
});

describe("markConnectionBroken", () => {
  it("notifies creator and founder exactly once per breakage", async () => {
    const { admin, calls } = fakeAdmin("active");
    expect(await markConnectionBroken(admin, { connectionId: "conn1", campaignId: "c1", reason: "invalid_grant" })).toBe(true);
    expect(await markConnectionBroken(admin, { connectionId: "conn1", campaignId: "c1", reason: "invalid_grant" })).toBe(false);
    expect(mockSend).toHaveBeenCalledTimes(2);
    const tos = mockSend.mock.calls.map((c) => c[0].to).sort();
    expect(tos).toEqual(["creator@example.com", "jonathan@wardsignup.com"]);
    const creatorCall = mockSend.mock.calls.find((c) => c[0].to === "creator@example.com");
    expect(creatorCall?.[0].urgent).toBe(true);
    expect(calls.some((c) => c.table === "campaign_calendar_sync" && (c.args[0] as any).last_error === CONNECTION_BROKEN_ERROR)).toBe(true);
    expect(calls.some((c) => (c.args[0] as any).broken_notified_at)).toBe(true);
  });

  it("notifies again after a reconnect clears the state", async () => {
    const { admin, state } = fakeAdmin("active");
    await markConnectionBroken(admin, { connectionId: "conn1", campaignId: "c1", reason: "invalid_grant" });
    await clearConnectionBroken(admin, "conn1");
    expect(state.status).toBe("active");
    await markConnectionBroken(admin, { connectionId: "conn1", campaignId: "c1", reason: "invalid_grant" });
    expect(mockSend).toHaveBeenCalledTimes(4);
  });

  it("does not notify (or throw) when the migration is not applied", async () => {
    const { admin } = fakeAdmin("active", { statusError: true });
    expect(await markConnectionBroken(admin, { connectionId: "conn1", reason: "invalid_grant" })).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("calendar-reconcile scheduling", () => {
  it("is hourly via GitHub Actions, not a Vercel cron (Hobby is daily only)", () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));
    const cron = cfg.crons.find((c: { path: string }) => c.path === "/api/cron/calendar-reconcile");
    expect(cron).toBeUndefined();
    const wf = fs.readFileSync(path.join(process.cwd(), ".github/workflows/calendar-reconcile.yml"), "utf8");
    expect(wf).toMatch(/cron: '\d+ \* \* \* \*'/);
    expect(wf).toContain("/api/cron/calendar-reconcile");
  });
});
