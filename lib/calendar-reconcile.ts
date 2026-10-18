/**
 * Hourly calendar-reconcile campaign loader.
 * Sessions store wall-clock fields as session_date + time + end_time — there is
 * no start_time column. Nested selects on campaigns.sessions.start_time 500 the
 * cron after CRON_SECRET auth succeeds.
 */

export const CALENDAR_RECONCILE_CAMPAIGN_LIMIT = 50;

type QueryError = { message: string };

/** Minimal admin client surface used by the loader (easy to mock in tests). */
export type CalendarReconcileAdmin = {
  from: (table: string) => any;
};

/** UTC calendar date YYYY-MM-DD, optionally shifted by whole days. */
export function utcYyyyMmDd(offsetDays = 0, nowMs = Date.now()): string {
  return new Date(nowMs + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Enabled calendar-sync campaigns that have at least one dated session on or
 * after yesterday UTC. Yesterday (not "today") is the lower bound so a slot
 * still upcoming in US timezones is not dropped when UTC has already rolled
 * to the next calendar day. Past-today slots are skipped later by
 * syncCampaignCalendar using session_date + time.
 */
export async function loadEnabledCampaignIdsWithUpcomingSessions(
  admin: CalendarReconcileAdmin,
  nowMs = Date.now(),
): Promise<{ campaignIds: string[]; error: { message: string } | null }> {
  const { data: syncRows, error: syncError } = await admin
    .from("campaign_calendar_sync")
    .select("campaign_id")
    .eq("enabled", true);

  if (syncError) {
    return { campaignIds: [], error: syncError as QueryError };
  }

  const enabledIds = [
    ...new Set(
      ((syncRows ?? []) as Array<{ campaign_id: string }>).map((row) => row.campaign_id).filter(Boolean),
    ),
  ];
  if (enabledIds.length === 0) {
    return { campaignIds: [], error: null };
  }

  const minDate = utcYyyyMmDd(-1, nowMs);
  const { data: sessions, error: sessionsError } = await admin
    .from("sessions")
    .select("campaign_id, session_date")
    .in("campaign_id", enabledIds)
    .not("session_date", "is", null)
    .gte("session_date", minDate);

  if (sessionsError) {
    return { campaignIds: [], error: sessionsError as QueryError };
  }

  const upcoming: string[] = [];
  const seen = new Set<string>();
  for (const session of (sessions ?? []) as Array<{ campaign_id: string }>) {
    const id = session.campaign_id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    upcoming.push(id);
    if (upcoming.length >= CALENDAR_RECONCILE_CAMPAIGN_LIMIT) break;
  }

  return { campaignIds: upcoming, error: null };
}
