/**
 * True when a Supabase error means a column does not exist yet, i.e. a migration
 * that adds it has not been applied to this database.
 *
 * - SELECT naming an unknown column: Postgres undefined_column, code 42703.
 * - INSERT / UPDATE with an unknown column: PostgREST PGRST204,
 *   "Could not find the 'x' column of 't' in the schema cache".
 *
 * Pass `column` to only match errors about that column.
 */
export function isMissingColumnError(error: unknown, column?: string): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  const msg = typeof message === "string" ? message : "";
  const mentionsColumn = column ? msg.includes(column) : true;
  if (code === "42703" || code === "PGRST204") return column ? mentionsColumn || !msg : true;
  return mentionsColumn && /(does not exist|in the schema cache)/i.test(msg) && /column/i.test(msg);
}
