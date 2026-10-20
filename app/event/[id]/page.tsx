import EventPageClient from "@/components/event/EventPageClient";
import { getServerEventCover, getServerEventPage } from "@/lib/public-event-page-server";

/**
 * Public event page. The event, its slots and public signups are read on the
 * server (shared with generateMetadata through React cache()), so the title
 * and description arrive in the HTML instead of after a spinner and two
 * browser round trips. If the server read is slow or fails, the client
 * component loads the data itself, exactly as before.
 */
export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [initialPage, initialCover] = await Promise.all([getServerEventPage(id), getServerEventCover(id)]);
  return <EventPageClient eventId={id} initialPage={initialPage} initialCover={initialCover} />;
}
