import { permanentRedirect } from "next/navigation";
import EventPageClient from "@/components/event/EventPageClient";
import { getServerEventCover, getServerEventSnapshot } from "@/lib/public-event-page-server";
import {
  canonicalPublicEventRedirect,
  cleanEventId,
  queryStringFromSearchParams,
} from "@/lib/public-event-id";

/**
 * Public event page. The event, its slots and public signups are read on the
 * server (shared with generateMetadata through React cache()), so the title
 * and description arrive in the HTML instead of after a spinner and two
 * browser round trips. If the server read is slow or fails, the client
 * component loads the data itself, exactly as before.
 */
export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // 308 when whitespace was stripped and the result is a real UUID. Query (UTM) stays.
  const target = canonicalPublicEventRedirect(`/event/${id}`, queryStringFromSearchParams(sp));
  if (target) permanentRedirect(target);
  const eventId = cleanEventId(id) || id;
  const [snapshot, initialCover] = await Promise.all([
    getServerEventSnapshot(eventId),
    getServerEventCover(eventId),
  ]);
  const initialPage = snapshot === undefined ? undefined : snapshot?.page ?? null;
  return (
    <EventPageClient
      eventId={eventId}
      initialPage={initialPage}
      initialLoadedAt={snapshot?.loadedAt}
      initialCover={initialCover}
    />
  );
}
