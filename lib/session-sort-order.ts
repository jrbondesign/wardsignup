/** Resilience helpers for the sessions.sort_order column.
 *
 * sort_order is added by a migration that must be applied per brand. To let the
 * app deploy before every brand's Supabase has run it, reads sort client-side
 * (never `.order("sort_order")` server-side, which errors on a missing column)
 * and writes retry without the column when it's absent. Once a brand's
 * migration lands, the column is present and these fallbacks stop firing. */

type PgError = { code?: string; message?: string; details?: string; hint?: string } | null;

/** True when an error is "the sessions.sort_order column does not exist yet". */
export function isMissingSortOrderError(error: PgError): boolean {
  if (!error) return false;
  const blob = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  if (!/sort_order/i.test(blob)) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /does not exist|schema cache|could not find/i.test(blob)
  );
}

/** Drop sort_order from row objects for a fallback write on un-migrated brands. */
export function stripSortOrder<T extends Record<string, unknown>>(rows: T[]): Array<Omit<T, "sort_order">> {
  return rows.map((row) => {
    const { sort_order, ...rest } = row;
    void sort_order;
    return rest;
  });
}

/** Ascending compare by sort_order with a stable fallback for rows that predate
 *  the column (undefined/equal → keep created_at/id order). */
export function compareBySortOrder(
  a: { sort_order?: number | null; created_at?: string | null; id?: string | null },
  b: { sort_order?: number | null; created_at?: string | null; id?: string | null },
): number {
  const ao = typeof a.sort_order === "number" ? a.sort_order : Number.MAX_SAFE_INTEGER;
  const bo = typeof b.sort_order === "number" ? b.sort_order : Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  const ac = a.created_at ?? "";
  const bc = b.created_at ?? "";
  if (ac !== bc) return ac < bc ? -1 : 1;
  return (a.id ?? "") < (b.id ?? "") ? -1 : (a.id ?? "") > (b.id ?? "") ? 1 : 0;
}
