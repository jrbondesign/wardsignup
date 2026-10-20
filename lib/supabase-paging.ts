/**
 * PostgREST (Supabase) caps every list response at 1,000 rows by default, so an
 * unpaged `.select()` silently drops everything past row 1,000. Use this helper for
 * any list query that can grow past that: it walks `.range()` pages in a stable order
 * until a short page comes back.
 */

export const SUPABASE_PAGE_SIZE = 1000;

type PageResult = { data: unknown[] | null; error: unknown };

/** The slice of a Supabase filter builder the pager needs. */
export interface PageableQuery {
  order(column: string, options?: { ascending?: boolean }): PageableQuery;
  range(from: number, to: number): PromiseLike<PageResult>;
}

export type FetchAllRowsOptions = {
  /** Short name for logs, e.g. "sessions.campaign_id". */
  label: string;
  /**
   * Columns to order by, ending with a unique column so pages never overlap or skip.
   * Defaults to ["id"].
   */
  orderBy?: string[];
  pageSize?: number;
  /** Safety stop so a bad filter can't loop forever. */
  maxPages?: number;
};

/**
 * Fetch every row of a query, one page at a time.
 *
 * `build` must return a fresh query each call (filters applied, no order/range):
 *   fetchAllRows(() => admin.from("sessions").select("campaign_id"), { label: "sessions" })
 *
 * On a page error it logs and returns the rows read so far, matching how the metrics
 * route already treats a failed query (show what we have rather than 500 the page).
 */
export async function fetchAllRows<T>(
  build: () => unknown,
  options: FetchAllRowsOptions,
): Promise<T[]> {
  const pageSize = options.pageSize ?? SUPABASE_PAGE_SIZE;
  const orderBy = options.orderBy ?? ["id"];
  const maxPages = options.maxPages ?? 1000;
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    let q = build() as PageableQuery;
    for (const col of orderBy) q = q.order(col, { ascending: true });
    const from = page * pageSize;
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) {
      console.error(`metrics paging (${options.label}):`, error);
      return rows;
    }
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
  console.warn(
    `metrics paging (${options.label}): stopped at ${maxPages * pageSize} rows (safety cap)`,
  );
  return rows;
}
