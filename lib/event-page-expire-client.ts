/**
 * Browser side: ask the server to expire the public event page cache after a
 * write the browser made straight to Supabase (edit page slot saves). Best
 * effort: never throws, so a failed call cannot fail the save; the page then
 * catches up within EVENT_PAGE_CACHE_SECONDS.
 */
export async function expirePublicEventPage(
  eventId: string | null | undefined,
  accessToken: string | null | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  if (!eventId || !accessToken) return false;
  try {
    const res = await fetchImpl(`/api/events/${encodeURIComponent(eventId)}/revalidate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.ok;
  } catch (err) {
    console.error("expirePublicEventPage failed:", err);
    return false;
  }
}
