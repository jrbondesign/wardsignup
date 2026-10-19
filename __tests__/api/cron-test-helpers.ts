import { NextRequest } from "next/server";

export type Op = { method: string; args: unknown[] };
export type QueryRecord = { table: string; ops: Op[] };
export type QueryResult = { data: unknown; error: { message: string } | null };
export type Resolver = (q: QueryRecord) => QueryResult;

const CHAIN_METHODS = [
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
  "eq",
  "neq",
  "in",
  "is",
  "not",
  "or",
  "gte",
  "lte",
  "gt",
  "lt",
  "order",
  "limit",
  "maybeSingle",
  "single",
] as const;

/**
 * Minimal chainable Supabase double. Every query is recorded; when awaited,
 * `resolve` decides the { data, error } based on the table and recorded ops.
 */
export function createFakeAdmin(resolve: Resolver) {
  const queries: QueryRecord[] = [];
  const admin = {
    from(table: string) {
      const record: QueryRecord = { table, ops: [] };
      queries.push(record);
      const builder: Record<string, unknown> = {};
      for (const m of CHAIN_METHODS) {
        builder[m] = (...args: unknown[]) => {
          record.ops.push({ method: m, args });
          return builder;
        };
      }
      builder.then = (
        onFulfilled: (v: QueryResult) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) => Promise.resolve().then(() => resolve(record)).then(onFulfilled, onRejected);
      return builder;
    },
  };
  return { admin, queries };
}

export function hasOp(q: QueryRecord, method: string): Op | undefined {
  return q.ops.find((o) => o.method === method);
}

export function eqValue(q: QueryRecord, column: string): unknown {
  return q.ops.find((o) => o.method === "eq" && o.args[0] === column)?.args[1];
}

export function cronRequest(path: string, secret?: string) {
  const headers: Record<string, string> = {};
  if (secret !== undefined) headers.Authorization = `Bearer ${secret}`;
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}
