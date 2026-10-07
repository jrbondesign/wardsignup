/**
 * @jest-environment node
 */

import {
  CONNECTION_DISCONNECTED_ERROR,
  isConnectionExpired,
  persistGoogleCalendarConnection,
  pickDisplayedConnection,
  type ConnectionAdmin,
  type ConnectionRow,
} from "@/lib/google-calendar-connection";

type Call = { table: string; method: string; args: unknown[] };

function createAdmin(options: {
  existing?: ConnectionRow[];
  selectError?: { message: string } | null;
  updateError?: { message: string } | null;
  insertError?: { message: string } | null;
}): { admin: ConnectionAdmin; calls: Call[] } {
  const calls: Call[] = [];

  const admin: ConnectionAdmin = {
    from(table: string) {
      const record = (method: string, args: unknown[]) => {
        calls.push({ table, method, args });
      };

      const chain: any = {
        select(...args: unknown[]) {
          record("select", args);
          return chain;
        },
        insert(row: unknown) {
          record("insert", [row]);
          return Promise.resolve({ data: null, error: options.insertError ?? null });
        },
        update(row: unknown) {
          record("update", [row]);
          return chain;
        },
        delete() {
          record("delete", []);
          return chain;
        },
        eq(...args: unknown[]) {
          record("eq", args);
          return chain;
        },
        in(...args: unknown[]) {
          record("in", args);
          return chain;
        },
        then(onFulfilled: (value: { data: ConnectionRow[] | null; error: { message: string } | null }) => unknown) {
          const isConnectionSelect = table === "google_calendar_connections" &&
            calls.some((c) => c.table === table && c.method === "select");
          const lastMutating = [...calls].reverse().find((c) =>
            c.table === table && ["update", "delete", "insert"].includes(c.method),
          );
          if (lastMutating?.method === "update") {
            return Promise.resolve({ data: null, error: options.updateError ?? null }).then(onFulfilled);
          }
          if (lastMutating?.method === "delete") {
            return Promise.resolve({ data: null, error: null }).then(onFulfilled);
          }
          if (isConnectionSelect && table === "google_calendar_connections") {
            return Promise.resolve({
              data: options.existing ?? [],
              error: options.selectError ?? null,
            }).then(onFulfilled);
          }
          return Promise.resolve({ data: [], error: null }).then(onFulfilled);
        },
      };

      return chain;
    },
  };

  return { admin, calls };
}

describe("pickDisplayedConnection", () => {
  it("prefers a live connection over an expired one", () => {
    const picked = pickDisplayedConnection([
      {
        id: "old",
        revoked_at: "2026-10-03T05:32:21.517Z",
        last_error: "Invalid grant - reauthorization needed",
      },
      { id: "live", revoked_at: null, last_error: null },
    ]);
    expect(picked?.id).toBe("live");
  });

  it("shows invalid_grant rows so Reconnect is available", () => {
    const picked = pickDisplayedConnection([
      {
        id: "old",
        revoked_at: "2026-10-03T05:32:21.517Z",
        last_error: "Invalid grant - reauthorization needed",
      },
    ]);
    expect(picked?.id).toBe("old");
  });

  it("hides intentional disconnect so Connect stays after refresh", () => {
    const picked = pickDisplayedConnection([
      {
        id: "disconnected",
        revoked_at: "2026-10-03T05:32:21.517Z",
        last_error: CONNECTION_DISCONNECTED_ERROR,
      },
    ]);
    expect(picked).toBeNull();
  });

  it("hides legacy revoked rows with no invalid_grant error", () => {
    const picked = pickDisplayedConnection([
      { id: "old", revoked_at: "2026-10-03T05:32:21.517Z", last_error: null },
    ]);
    expect(picked).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(pickDisplayedConnection([])).toBeNull();
  });
});

describe("isConnectionExpired", () => {
  it("does not treat intentional disconnect as expired", () => {
    expect(
      isConnectionExpired({
        revoked_at: "2026-10-03T00:00:00Z",
        last_error: CONNECTION_DISCONNECTED_ERROR,
      }),
    ).toBe(false);
  });

  it("treats invalid_grant as expired", () => {
    expect(
      isConnectionExpired({
        revoked_at: null,
        last_error: "invalid_grant: Token has been expired or revoked",
      }),
    ).toBe(true);
  });

  it("treats Invalid grant reauthorization text as expired", () => {
    expect(
      isConnectionExpired({
        revoked_at: "2026-10-03T00:00:00Z",
        last_error: "Invalid grant - reauthorization needed",
      }),
    ).toBe(true);
  });

  it("treats a live row as active", () => {
    expect(isConnectionExpired({ revoked_at: null, last_error: null })).toBe(false);
  });
});

describe("persistGoogleCalendarConnection", () => {
  const input = {
    userId: "user-1",
    organizationId: "org-1",
    googleEmail: "bondesign@gmail.com",
    refreshTokenEnc: "enc-new",
    scopes: "calendar.events",
  };

  it("inserts when the user has no connection for the org", async () => {
    const { admin, calls } = createAdmin({ existing: [] });
    const result = await persistGoogleCalendarConnection(admin, input);
    expect(result.error).toBeNull();
    const insert = calls.find((c) => c.method === "insert");
    expect(insert?.args[0]).toMatchObject({
      google_email: "bondesign@gmail.com",
      refresh_token_enc: "enc-new",
      revoked_at: null,
      last_error: null,
    });
  });

  it("updates the existing expired row instead of inserting a second one", async () => {
    const { admin, calls } = createAdmin({
      existing: [{ id: "19140da8", google_email: "bondesign@gmail.com", revoked_at: "2026-10-03T05:32:21.517Z" }],
    });
    const result = await persistGoogleCalendarConnection(admin, input);
    expect(result.error).toBeNull();
    expect(result.connectionId).toBe("19140da8");
    expect(calls.some((c) => c.method === "insert")).toBe(false);
    expect(calls).toContainEqual({
      table: "google_calendar_connections",
      method: "eq",
      args: ["id", "19140da8"],
    });
    expect(calls).toContainEqual({
      table: "campaign_calendar_sync",
      method: "eq",
      args: ["last_error", CONNECTION_DISCONNECTED_ERROR],
    });
  });

  it("reuses a row when Google email casing differs", async () => {
    const { admin, calls } = createAdmin({
      existing: [{ id: "row-1", google_email: "Bondesign@Gmail.com", revoked_at: "2026-10-03T05:32:21.517Z" }],
    });
    const result = await persistGoogleCalendarConnection(admin, input);
    expect(result.connectionId).toBe("row-1");
    expect(calls.some((c) => c.method === "insert")).toBe(false);
  });

  it("collapses duplicate rows onto the kept connection", async () => {
    const { admin, calls } = createAdmin({
      existing: [
        { id: "expired", google_email: "old@gmail.com", revoked_at: "2026-10-03T05:32:21.517Z" },
        { id: "fresh", google_email: "bondesign@gmail.com", revoked_at: null },
      ],
    });
    const result = await persistGoogleCalendarConnection(admin, input);
    expect(result.connectionId).toBe("fresh");
    expect(calls).toContainEqual({
      table: "campaign_calendar_sync",
      method: "in",
      args: ["connection_id", ["expired"]],
    });
    expect(calls).toContainEqual({
      table: "google_calendar_connections",
      method: "in",
      args: ["id", ["expired"]],
    });
  });
});
