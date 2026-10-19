import { TEAM_EMAIL_HOGQL_REGEX } from "@/lib/team-accounts";

/**
 * Read-side PostHog access (HogQL) using a personal API key with query:read scope.
 * Returns null when not configured or on any failure so callers can fall back.
 */
export async function posthogWeeklyEventCounts(
  events: string[],
  sinceIso: string,
): Promise<Record<string, Record<string, number>> | null> {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!key) return null;
  const host = process.env.POSTHOG_API_HOST ?? "https://us.posthog.com";
  const project = process.env.POSTHOG_PROJECT_ID ?? "@current";
  const list = events.map((e) => `'${e.replace(/[^a-z0-9_$]/gi, "")}'`).join(",");
  const since = sinceIso.replace(/[^0-9T:.\-Z]/g, "");
  // Weeks are Monday to Sunday in Phoenix time, same as the rest of the founder metrics page.
  const query = `select event, toString(toStartOfWeek(toTimeZone(timestamp, 'America/Phoenix'), 1)) as w, count() from events
    where event in (${list}) and timestamp >= toDateTime('${since.slice(0, 19).replace("T", " ")}')
    group by event, w`;
  try {
    const res = await fetch(`${host}/api/projects/${project}/query/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("posthog query failed", res.status);
      return null;
    }
    const json = (await res.json()) as { results?: [string, string, number][] };
    const out: Record<string, Record<string, number>> = {};
    for (const [event, week, count] of json.results ?? []) {
      (out[event] ??= {})[week.slice(0, 10)] = Number(count);
    }
    return out;
  } catch (e) {
    console.error("posthog query error", e);
    return null;
  }
}

async function runHogQL<T>(query: string): Promise<T[] | null> {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!key) return null;
  const host = process.env.POSTHOG_API_HOST ?? "https://us.posthog.com";
  const project = process.env.POSTHOG_PROJECT_ID ?? "@current";
  try {
    const res = await fetch(`${host}/api/projects/${project}/query/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("posthog query failed", res.status);
      return null;
    }
    const json = (await res.json()) as { results?: T[] };
    return json.results ?? [];
  } catch (e) {
    console.error("posthog query error", e);
    return null;
  }
}

export type CoreWeekCounts = {
  visitors: number;
  slotSignups: number;
  peopleSigningUp: number;
  itemSignups: number;
  sheetsCreated: number;
  activeOrganizers: number;
};

export type CoreWeeklyPosthog = {
  /** Phoenix Monday (YYYY-MM-DD) to counts. */
  weeks: Record<string, CoreWeekCounts>;
  /** Phoenix Monday to the PostHog person ids active as organizers that week. */
  organizersByWeek: Record<string, string[]>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_SAFE_RE = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+$/i;

/** Builds the HogQL team filter (exported for tests). */
export function coreTeamFilterSql(teamSheetIds: Iterable<string>, extraTeamEmails: Iterable<string>): string {
  const ids = [...teamSheetIds].filter((id) => UUID_RE.test(id)).map((id) => `'${id.toLowerCase()}'`);
  const emails = [...extraTeamEmails]
    .map((e) => e.trim().toLowerCase())
    .filter((e) => EMAIL_SAFE_RE.test(e))
    .map((e) => `'${e}'`);
  const parts = [
    `not match(lower(coalesce(toString(person.properties.email), '')), '${TEAM_EMAIL_HOGQL_REGEX}')`,
  ];
  if (emails.length) parts.push(`lower(coalesce(toString(person.properties.email), '')) not in (${emails.join(",")})`);
  if (ids.length) {
    const list = ids.join(",");
    parts.push(`lower(coalesce(toString(properties.campaign_id), '')) not in (${list})`);
    parts.push(`lower(coalesce(toString(properties.event_id), '')) not in (${list})`);
  }
  return parts.join("\n      and ");
}

/**
 * Core weekly PostHog counts for the founder metrics strip, in Phoenix Monday to
 * Sunday weeks, team and test accounts excluded (by person email and by team sheet).
 * Returns null when PostHog is not configured or the query fails.
 */
export async function posthogCoreWeekly(opts: {
  sinceIso: string;
  teamSheetIds: Iterable<string>;
  extraTeamEmails?: Iterable<string>;
}): Promise<CoreWeeklyPosthog | null> {
  const since = opts.sinceIso.replace(/[^0-9T:.\-Z]/g, "").slice(0, 19).replace("T", " ");
  const team = coreTeamFilterSql(opts.teamSheetIds, opts.extraTeamEmails ?? []);
  const week = `toString(toStartOfWeek(toTimeZone(timestamp, 'America/Phoenix'), 1))`;
  const countsQuery = `select ${week} as w,
      uniqIf(person_id, event = '$pageview') as visitors,
      countIf(event = 'signup_completed') as slot_signups,
      uniqIf(person_id, event = 'signup_completed') as people_signing_up,
      countIf(event = 'item_signup_completed') as item_signups,
      countIf(event = 'event_created') as sheets_created,
      uniqIf(person_id, event in ('user_signed_in', 'event_created', 'event_shared')) as active_organizers
    from events
    where timestamp >= toDateTime('${since}')
      and event in ('$pageview', 'signup_completed', 'item_signup_completed', 'event_created', 'user_signed_in', 'event_shared')
      and ${team}
    group by w
    order by w`;
  const organizersQuery = `select ${week} as w, toString(person_id) as pid
    from events
    where timestamp >= toDateTime('${since}')
      and event in ('user_signed_in', 'event_created', 'event_shared')
      and ${team}
    group by w, pid
    limit 10000`;
  const [counts, organizers] = await Promise.all([
    runHogQL<[string, number, number, number, number, number, number]>(countsQuery),
    runHogQL<[string, string]>(organizersQuery),
  ]);
  if (!counts || !organizers) return null;
  const weeks: Record<string, CoreWeekCounts> = {};
  for (const [w, visitors, slot, people, items, sheets, active] of counts) {
    weeks[String(w).slice(0, 10)] = {
      visitors: Number(visitors) || 0,
      slotSignups: Number(slot) || 0,
      peopleSigningUp: Number(people) || 0,
      itemSignups: Number(items) || 0,
      sheetsCreated: Number(sheets) || 0,
      activeOrganizers: Number(active) || 0,
    };
  }
  const organizersByWeek: Record<string, string[]> = {};
  for (const [w, pid] of organizers) (organizersByWeek[String(w).slice(0, 10)] ??= []).push(String(pid));
  return { weeks, organizersByWeek };
}
