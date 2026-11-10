import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { loadPublicEventPage, type PublicEventClient, type PublicEventPageData } from "@/lib/public-event-page";
import { publicCoverForCampaign } from "@/lib/event-media";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import type { PublicCover } from "@/lib/use-public-cover";
import { EVENT_PAGE_CACHE_SECONDS, eventPageTag } from "@/lib/event-page-cache";
import { cleanEventId, isPublicEventUuid } from "@/lib/public-event-id";

/**
 * Server side loads for /event/[id], memoized per request with React cache()
 * so generateMetadata (layout) and the page share one database read.
 *
 * Results:
 *   PublicEventPageData  loaded
 *   null                 the event does not exist
 *   undefined            not known (slow or failed); the client loads it as before
 *
 * Each load gives up after SERVER_LOAD_TIMEOUT_MS so a slow Supabase can't
 * hold the whole page; the browser then shows the spinner and fetches itself.
 *
 * The event page read is also shared across requests for
 * EVENT_PAGE_CACHE_SECONDS (tag eventPageTag(id)); signup, cancel and edit
 * routes expire it with revalidateEventPage. Failures throw inside the cache
 * so they are never stored.
 */

export const SERVER_LOAD_TIMEOUT_MS = 1500;

/** UUID with whitespace removed, or null when it still is not a UUID. */
function acceptedEventId(eventId: string): string | null {
  const cleaned = cleanEventId(eventId);
  return isPublicEventUuid(cleaned) ? cleaned : null;
}

export async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function anonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Server loaded event page plus when it was read (ms epoch), so the browser can tell how fresh it is. */
export interface ServerEventSnapshot {
  page: PublicEventPageData;
  loadedAt: number;
}

function loadCachedEventSnapshot(eventId: string): Promise<ServerEventSnapshot | null> {
  return unstable_cache(
    async (id: string): Promise<ServerEventSnapshot | null> => {
      const page = await loadPublicEventPage(anonClient() as unknown as PublicEventClient, id);
      return page ? { page, loadedAt: Date.now() } : null;
    },
    ["public-event-page-v1", eventId],
    { revalidate: EVENT_PAGE_CACHE_SECONDS, tags: [eventPageTag(eventId)] }
  )(eventId);
}

export const getServerEventSnapshot = cache(
  async (eventId: string): Promise<ServerEventSnapshot | null | undefined> => {
    const id = acceptedEventId(eventId);
    if (!id) return null;
    try {
      return await withTimeout(loadCachedEventSnapshot(id), SERVER_LOAD_TIMEOUT_MS);
    } catch (err) {
      console.error("Server event page load failed:", err);
      return undefined;
    }
  }
);

export async function getServerEventPage(eventId: string): Promise<PublicEventPageData | null | undefined> {
  const snapshot = await getServerEventSnapshot(eventId);
  return snapshot === undefined ? undefined : snapshot?.page ?? null;
}

/** Cover for the event page, already gated by the cover feature allowlist. */
export const getServerEventCover = cache(
  async (eventId: string): Promise<PublicCover | null | undefined> => {
    const id = acceptedEventId(eventId);
    if (!id) return null;
    try {
      return await withTimeout(publicCoverForCampaign(createServiceRoleClient(), id), SERVER_LOAD_TIMEOUT_MS);
    } catch (err) {
      console.error("Server event cover load failed:", err);
      return undefined;
    }
  }
);
