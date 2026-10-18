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
  const query = `select event, toString(toStartOfWeek(timestamp, 1)) as w, count() from events
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
