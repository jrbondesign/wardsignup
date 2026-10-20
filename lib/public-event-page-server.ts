import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { loadPublicEventPage, type PublicEventClient, type PublicEventPageData } from "@/lib/public-event-page";
import { publicCoverForCampaign } from "@/lib/event-media";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import type { PublicCover } from "@/lib/use-public-cover";

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
 */

export const SERVER_LOAD_TIMEOUT_MS = 1500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export const getServerEventPage = cache(
  async (eventId: string): Promise<PublicEventPageData | null | undefined> => {
    if (!UUID_RE.test(eventId)) return null;
    try {
      return await withTimeout(
        loadPublicEventPage(anonClient() as unknown as PublicEventClient, eventId),
        SERVER_LOAD_TIMEOUT_MS
      );
    } catch (err) {
      console.error("Server event page load failed:", err);
      return undefined;
    }
  }
);

/** Cover for the event page, already gated by the cover feature allowlist. */
export const getServerEventCover = cache(
  async (eventId: string): Promise<PublicCover | null | undefined> => {
    if (!UUID_RE.test(eventId)) return null;
    try {
      return await withTimeout(publicCoverForCampaign(createServiceRoleClient(), eventId), SERVER_LOAD_TIMEOUT_MS);
    } catch (err) {
      console.error("Server event cover load failed:", err);
      return undefined;
    }
  }
);
