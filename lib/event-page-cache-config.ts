/**
 * How long the server keeps the shared public event page read (/event/[id])
 * before re-reading Postgres on its own. Client safe: no next/cache import.
 *
 * Every route that changes what the page shows expires the per-event tag on
 * demand (revalidateEventPage), so organizer edits and signups show on the
 * next load. This window is only the safety net for a write that bypasses
 * those routes (a SQL edit in the Supabase dashboard, a migration, a cascade).
 * 5 minutes: views in a burst (a sheet link shared in a ward chat) cost one
 * read instead of one every 30 s, and a missed write is never more than
 * 5 minutes behind.
 */
export const EVENT_PAGE_CACHE_SECONDS = 300;
