/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: jest.fn(),
}));

jest.mock("@/lib/google-calendar-sync", () => ({
  syncCampaignCalendar: jest.fn(),
}));

jest.mock("@/lib/gcal-feature", () => ({
  isGcalSyncFeatureEnabled: jest.fn(),
}));

jest.mock("@/lib/rate-limit", () => ({
  claimCronRun: jest.fn(),
  hourBucketDate: jest.fn(() => new Date("2026-10-03T14:00:00.000Z")),
}));

import { GET } from "@/app/api/cron/calendar-reconcile/route";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { syncCampaignCalendar } from "@/lib/google-calendar-sync";
import { isGcalSyncFeatureEnabled } from "@/lib/gcal-feature";
import { claimCronRun } from "@/lib/rate-limit";

const mockCreateClient = createServiceRoleClient as jest.MockedFunction<
  typeof createServiceRoleClient
>;
const mockSync = syncCampaignCalendar as jest.MockedFunction<typeof syncCampaignCalendar>;
const mockFeature = isGcalSyncFeatureEnabled as jest.MockedFunction<
  typeof isGcalSyncFeatureEnabled
>;
const mockClaim = claimCronRun as jest.MockedFunction<typeof claimCronRun>;

type Call = { table: string; method: string; args: unknown[] };

function createRecordingAdmin(options: {
  syncRows?: Array<{ campaign_id: string }> | null;
  syncError?: { message: string } | null;
  sessionRows?: Array<{ campaign_id: string; session_date: string | null }> | null;
  sessionsError?: { message: string } | null;
}) {
  const calls: Call[] = [];
  const admin = {
    from(table: string) {
      const record = (method: string, args: unknown[]) => {
        calls.push({ table, method, args });
      };
      const result = Promise.resolve(
        table === "sessions"
          ? { data: options.sessionRows ?? [], error: options.sessionsError ?? null }
          : { data: options.syncRows ?? [], error: options.syncError ?? null },
      );
      const query = {
        select(...args: unknown[]) {
          record("select", args);
          return this;
        },
        eq(...args: unknown[]) {
          record("eq", args);
          return this;
        },
        in(...args: unknown[]) {
          record("in", args);
          return this;
        },
        not(...args: unknown[]) {
          record("not", args);
          return this;
        },
        gte(...args: unknown[]) {
          record("gte", args);
          return this;
        },
        then: result.then.bind(result),
      };
      return query;
    },
  };
  return { admin, calls };
}

function requestWithSecret(secret: string) {
  return new NextRequest("http://localhost:3000/api/cron/calendar-reconcile", {
    headers: { Authorization: `Bearer ${secret}` },
  });
}

describe("/api/cron/calendar-reconcile", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    mockFeature.mockReturnValue(true);
    mockClaim.mockResolvedValue({ claimed: true });
  });

  afterAll(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("returns 401 when the bearer token does not match CRON_SECRET", async () => {
    const response = await GET(requestWithSecret("wrong"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("returns Failed to load campaigns when the campaign query errors", async () => {
    const { admin } = createRecordingAdmin({
      syncError: { message: "column sessions.start_time does not exist" },
    });
    mockCreateClient.mockReturnValue(admin as ReturnType<typeof createServiceRoleClient>);

    const response = await GET(requestWithSecret("test-cron-secret"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to load campaigns" });
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("loads campaigns with session_date, not start_time, then syncs unique ids", async () => {
    const { admin, calls } = createRecordingAdmin({
      syncRows: [{ campaign_id: "camp-1" }, { campaign_id: "camp-2" }],
      sessionRows: [
        { campaign_id: "camp-1", session_date: "2026-10-10" },
        { campaign_id: "camp-2", session_date: "2026-10-11" },
      ],
    });
    mockCreateClient.mockReturnValue(admin as ReturnType<typeof createServiceRoleClient>);
    mockSync.mockResolvedValue({ success: true });

    const response = await GET(requestWithSecret("test-cron-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      total: 2,
      success: 2,
      failed: 0,
    });
    expect(mockSync).toHaveBeenCalledWith("camp-1");
    expect(mockSync).toHaveBeenCalledWith("camp-2");

    const encoded = JSON.stringify(calls);
    expect(encoded).not.toMatch(/start_time/);
    expect(calls).toContainEqual({
      table: "sessions",
      method: "select",
      args: ["campaign_id, session_date"],
    });
    expect(calls).toContainEqual({
      table: "sessions",
      method: "gte",
      args: ["session_date", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)],
    });
  });
});
