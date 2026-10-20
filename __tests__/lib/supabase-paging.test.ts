import { describe, it, expect, jest } from "@jest/globals";
import { fetchAllRows, SUPABASE_PAGE_SIZE } from "@/lib/supabase-paging";

/** A fake Supabase query that, like PostgREST, never returns more than 1,000 rows. */
function fakeTable<T>(rows: T[], opts: { failOnFrom?: number } = {}) {
  const ranges: [number, number][] = [];
  const orders: string[][] = [];
  const build = () => {
    const order: string[] = [];
    const q = {
      order(col: string) {
        order.push(col);
        return q;
      },
      async range(from: number, to: number) {
        ranges.push([from, to]);
        orders.push(order);
        if (opts.failOnFrom === from) return { data: null, error: { message: "boom" } };
        const end = Math.min(to + 1, from + SUPABASE_PAGE_SIZE);
        return { data: rows.slice(from, end), error: null };
      },
    };
    return q;
  };
  return { build, ranges, orders };
}

const sessions = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, campaign_id: `c${i % 71}` }));

describe("fetchAllRows", () => {
  it("reads all 2,881 rows across three 1,000 row pages", async () => {
    const t = fakeTable(sessions(2881));
    const rows = await fetchAllRows<{ campaign_id: string }>(t.build, { label: "sessions" });
    expect(rows).toHaveLength(2881);
    expect(new Set(rows.map((r) => r.campaign_id)).size).toBe(71);
    expect(t.ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("orders every page by a stable column (id by default)", async () => {
    const t = fakeTable(sessions(1500));
    await fetchAllRows(t.build, { label: "sessions" });
    expect(t.orders).toEqual([["id"], ["id"]]);
    const t2 = fakeTable(sessions(10));
    await fetchAllRows(t2.build, { label: "x", orderBy: ["signed_up_at", "id"] });
    expect(t2.orders).toEqual([["signed_up_at", "id"]]);
  });

  it("asks for one more page when the count is an exact multiple of 1,000", async () => {
    const t = fakeTable(sessions(2000));
    const rows = await fetchAllRows(t.build, { label: "sessions" });
    expect(rows).toHaveLength(2000);
    expect(t.ranges).toHaveLength(3);
  });

  it("handles an empty table with one request", async () => {
    const t = fakeTable([]);
    expect(await fetchAllRows(t.build, { label: "empty" })).toEqual([]);
    expect(t.ranges).toHaveLength(1);
  });

  it("logs and returns the rows read so far when a page errors", async () => {
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    const t = fakeTable(sessions(2500), { failOnFrom: 1000 });
    const rows = await fetchAllRows(t.build, { label: "sessions" });
    expect(rows).toHaveLength(1000);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("stops at the safety cap", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const t = fakeTable(sessions(5000));
    const rows = await fetchAllRows(t.build, { label: "sessions", maxPages: 2 });
    expect(rows).toHaveLength(2000);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
