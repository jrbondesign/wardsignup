import EventPageClient from "@/components/event/EventPageClient";
import { getServerEventCover, getServerEventSnapshot } from "@/lib/public-event-page-server";

/**
 * Public event page. The event, its slots and public signups are read on the
 * server (shared with generateMetadata through React cache()), so the title
 * and description arrive in the HTML instead of after a spinner and two
 * browser round trips. If the server read is slow or fails, the client
 * component loads the data itself, exactly as before.
 */
export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [snapshot, initialCover] = await Promise.all([getServerEventSnapshot(id), getServerEventCover(id)]);
  const initialPage = snapshot === undefined ? undefined : snapshot?.page ?? null;
  return (
    <EventPageClient
      eventId={id}
      initialPage={initialPage}
      initialLoadedAt={snapshot?.loadedAt}
      initialCover={initialCover}
    />
  );
}
