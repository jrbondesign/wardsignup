/**
 * @jest-environment node
 */

import {
  CALENDAR_RECONCILE_CAMPAIGN_LIMIT,
  loadEnabledCampaignIdsWithUpcomingSessions,
  utcYyyyMmDd,
} from "@/lib/calendar-reconcile";

type Call = { table: string; method: string; args: unknown[] };

function serializeCalls(calls: Call[]): string {
  return JSON.stringify(calls);
}

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
      const syncResult = Promise.resolve({
        data: options.syncRows ?? [],
        error: options.syncError ?? null,
      });
      const sessionsResult = Promise.resolve({
        data: options.sessionRows ?? [],
        error: options.sessionsError ?? null,
      });

      const sessionsQuery = {
        select(...args: unknown[]) {
          record("select", args);
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
        then: sessionsResult.then.bind(sessionsResult),
      };

      const syncQuery = {
        select(...args: unknown[]) {
          record("select", args);
          return this;
        },
        eq(...args: unknown[]) {
          record("eq", args);
          return this;
        },
        then: syncResult.then.bind(syncResult),
      };

      return table === "sessions" ? sessionsQuery : syncQuery;
    },
  };

  return { admin, calls };
}

describe("utcYyyyMmDd", () => {
  it("returns yesterday UTC as YYYY-MM-DD for offset -1", () => {
    expect(utcYyyyMmDd(-1, Date.UTC(2026, 9, 3, 2, 0, 0))).toBe("2026-10-02");
  });
});

describe("loadEnabledCampaignIdsWithUpcomingSessions", () => {
  it("loads enabled sync rows then filters sessions by session_date, never start_time", async () => {
    const nowMs = Date.UTC(2026, 9, 3, 2, 0, 0); // 02:00 UTC Oct 3 → still Oct 2 evening in US
    const { admin, calls } = createRecordingAdmin({
      syncRows: [{ campaign_id: "camp-1" }, { campaign_id: "camp-2" }],
      sessionRows: [
        { campaign_id: "camp-1", session_date: "2026-10-02" },
        { campaign_id: "camp-1", session_date: "2026-10-05" },
        { campaign_id: "camp-2", session_date: "2026-10-04" },
      ],
    });

    const { campaignIds, error } = await loadEnabledCampaignIdsWithUpcomingSessions(
      admin,
      nowMs,
    );

    expect(error).toBeNull();
    expect(campaignIds).toEqual(["camp-1", "camp-2"]);

    const encoded = serializeCalls(calls);
    expect(encoded).not.toMatch(/start_time/);

    expect(calls).toContainEqual({
      table: "campaign_calendar_sync",
      method: "select",
      args: ["campaign_id"],
    });
    expect(calls).toContainEqual({
      table: "campaign_calendar_sync",
      method: "eq",
      args: ["enabled", true],
    });
    expect(calls).toContainEqual({
      table: "sessions",
      method: "select",
      args: ["campaign_id, session_date"],
    });
    expect(calls).toContainEqual({
      table: "sessions",
      method: "in",
      args: ["campaign_id", ["camp-1", "camp-2"]],
    });
    expect(calls).toContainEqual({
      table: "sessions",
      method: "not",
      args: ["session_date", "is", null],
    });
    expect(calls).toContainEqual({
      table: "sessions",
      method: "gte",
      args: ["session_date", "2026-10-02"],
    });
  });

  it("returns the campaign_calendar_sync error so the route can 500", async () => {
    const { admin, calls } = createRecordingAdmin({
      syncError: { message: 'column sessions.start_time does not exist' },
    });

    const { campaignIds, error } = await loadEnabledCampaignIdsWithUpcomingSessions(admin);

    expect(campaignIds).toEqual([]);
    expect(error?.message).toBe("column sessions.start_time does not exist");
    expect(serializeCalls(calls)).not.toMatch(/start_time/);
    expect(calls.some((c) => c.table === "sessions")).toBe(false);
  });

  it("returns the sessions query error so the route can 500", async () => {
    const { admin } = createRecordingAdmin({
      syncRows: [{ campaign_id: "camp-1" }],
      sessionsError: { message: "Failed to load sessions" },
    });

    const { campaignIds, error } = await loadEnabledCampaignIdsWithUpcomingSessions(admin);

    expect(campaignIds).toEqual([]);
    expect(error?.message).toBe("Failed to load sessions");
  });

  it("returns no campaigns when none are enabled", async () => {
    const { admin, calls } = createRecordingAdmin({ syncRows: [] });

    const { campaignIds, error } = await loadEnabledCampaignIdsWithUpcomingSessions(admin);

    expect(error).toBeNull();
    expect(campaignIds).toEqual([]);
    expect(calls.some((c) => c.table === "sessions")).toBe(false);
  });

  it("caps unique campaign ids at the hourly batch limit", async () => {
    const syncRows = Array.from({ length: CALENDAR_RECONCILE_CAMPAIGN_LIMIT + 5 }, (_, i) => ({
      campaign_id: `camp-${i}`,
    }));
    const sessionRows = syncRows.map((row) => ({
      campaign_id: row.campaign_id,
      session_date: "2026-10-10",
    }));
    const { admin } = createRecordingAdmin({ syncRows, sessionRows });

    const { campaignIds, error } = await loadEnabledCampaignIdsWithUpcomingSessions(admin);

    expect(error).toBeNull();
    expect(campaignIds).toHaveLength(CALENDAR_RECONCILE_CAMPAIGN_LIMIT);
  });
});
