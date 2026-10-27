/**
 * Ward/Unit, Organization and Calling for each creator on /admin/metrics.
 *
 * Read server side with the service role client the metrics route already uses
 * (the route is admin only). organizer_profiles.calling and organizations.ward_name
 * arrive in migration 20261025120000_organizer_calling.sql. Until it is applied those
 * selects fail with "column does not exist", and the metrics page must still load:
 * callings then show as not set, and organizations fall back to name only.
 */

import { normalizeCalling } from "@/lib/callings";
import { isMissingColumnError } from "@/lib/missing-column";
import { SUPABASE_PAGE_SIZE } from "@/lib/supabase-paging";
import { normalizeWardName } from "@/lib/ward-name";

type PageResult = { data: unknown[] | null; error: unknown };

interface IdentityQuery {
  eq(column: string, value: string): IdentityQuery;
  order(column: string, options?: { ascending?: boolean }): IdentityQuery;
  range(from: number, to: number): PromiseLike<PageResult>;
}

/** The slice of the Supabase client this helper needs (kept small so tests can fake it). */
export interface CreatorIdentityClient {
  from(table: string): { select(columns: string): IdentityQuery };
}

export type CreatorOrg = { name: string; wardName: string | null };

export type CreatorIdentity = {
  /** user_id to calling, only for users who have one set. */
  callingByUserId: Map<string, string>;
  /** owner user_id to the organizations they own. */
  orgsByOwnerId: Map<string, CreatorOrg[]>;
  /** False when organizer_profiles.calling could not be read (migration not applied, or a read error). */
  callingsAvailable: boolean;
  /** False when organizations.ward_name could not be read. */
  wardsAvailable: boolean;
};

async function readAll<T>(
  build: () => IdentityQuery,
  orderBy: string,
  maxPages: number,
): Promise<{ rows: T[]; error: unknown }> {
  const rows: T[] = [];
  try {
    for (let page = 0; page < maxPages; page += 1) {
      const from = page * SUPABASE_PAGE_SIZE;
      const { data, error } = await build()
        .order(orderBy, { ascending: true })
        .range(from, from + SUPABASE_PAGE_SIZE - 1);
      if (error) return { rows: [], error };
      const batch = (data ?? []) as T[];
      rows.push(...batch);
      if (batch.length < SUPABASE_PAGE_SIZE) break;
    }
  } catch (error) {
    return { rows: [], error: error ?? new Error("read failed") };
  }
  return { rows, error: null };
}

function logUnavailable(what: string, column: string, error: unknown) {
  if (isMissingColumnError(error, column)) {
    console.warn(`metrics: ${what} not found (migration not applied yet); showing it as not set`);
  } else {
    console.error(`metrics: ${what} read failed; showing it as not set:`, error);
  }
}

export async function fetchCreatorIdentity(
  admin: CreatorIdentityClient,
  options: { brandId?: string | null; maxPages?: number } = {},
): Promise<CreatorIdentity> {
  const maxPages = options.maxPages ?? 1000;
  const brandId = options.brandId ?? null;
  const scoped = (table: string, columns: string) => () => {
    const q = admin.from(table).select(columns);
    return brandId ? q.eq("brand_id", brandId) : q;
  };

  const [profiles, orgsWithWard] = await Promise.all([
    readAll<{ user_id: string; calling: string | null }>(
      scoped("organizer_profiles", "user_id, calling"),
      "user_id",
      maxPages,
    ),
    readAll<{ id: string; owner_id: string | null; name: string | null; ward_name?: string | null }>(
      scoped("organizations", "id, owner_id, name, ward_name"),
      "id",
      maxPages,
    ),
  ]);

  const callingByUserId = new Map<string, string>();
  let callingsAvailable = true;
  if (profiles.error) {
    logUnavailable("organizer_profiles.calling", "calling", profiles.error);
    callingsAvailable = false;
  } else {
    for (const row of profiles.rows) {
      const calling = normalizeCalling(row.calling);
      // A user can have one profile per brand; the first one with a calling wins.
      if (calling && row.user_id && !callingByUserId.has(row.user_id)) callingByUserId.set(row.user_id, calling);
    }
  }

  let wardsAvailable = true;
  let orgRows = orgsWithWard.rows;
  if (orgsWithWard.error) {
    logUnavailable("organizations.ward_name", "ward_name", orgsWithWard.error);
    wardsAvailable = false;
    // Still show organization names without the ward column.
    const nameOnly = await readAll<{ id: string; owner_id: string | null; name: string | null }>(
      scoped("organizations", "id, owner_id, name"),
      "id",
      maxPages,
    );
    if (nameOnly.error) console.error("metrics: organizations read failed:", nameOnly.error);
    orgRows = nameOnly.rows;
  }
  const orgsByOwnerId = new Map<string, CreatorOrg[]>();
  for (const o of orgRows) {
    const name = o.name?.trim();
    if (!o.owner_id || !name) continue;
    const list = orgsByOwnerId.get(o.owner_id) ?? [];
    list.push({ name, wardName: normalizeWardName(o.ward_name) });
    orgsByOwnerId.set(o.owner_id, list);
  }

  return { callingByUserId, orgsByOwnerId, callingsAvailable, wardsAvailable };
}

/** Distinct non empty values joined for one table cell, or null when there are none. */
function joinDistinct(values: (string | null)[]): string | null {
  const seen: string[] = [];
  for (const v of values) if (v && !seen.includes(v)) seen.push(v);
  return seen.length ? seen.join(", ") : null;
}

/**
 * Attach Ward/Unit, Organization and Calling to each creator row. Creator rows are
 * keyed by the event owner's email (metrics_creator_breakdown groups by
 * campaigns.user_email), so emails are matched to auth users, then to that user's
 * calling and the organizations they own. Anything unknown is null.
 */
export function attachCreatorIdentity<T extends { email: string }>(
  creators: T[],
  users: { id: string; email?: string | null }[],
  identity: CreatorIdentity,
): (T & { wardName: string | null; organization: string | null; calling: string | null })[] {
  const userIdByEmail = new Map<string, string>();
  for (const u of users) {
    const e = u.email?.trim().toLowerCase();
    if (e && !userIdByEmail.has(e)) userIdByEmail.set(e, u.id);
  }
  return creators.map((c) => {
    const id = userIdByEmail.get(c.email.trim().toLowerCase());
    const orgs = (id && identity.orgsByOwnerId.get(id)) || [];
    return {
      ...c,
      wardName: joinDistinct(orgs.map((o) => o.wardName)),
      organization: joinDistinct(orgs.map((o) => o.name)),
      calling: (id && identity.callingByUserId.get(id)) || null,
    };
  });
}
