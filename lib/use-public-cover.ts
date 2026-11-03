"use client";

import { useEffect, useState } from "react";
import { coverObjectPosition } from "@/lib/cover-position";

export interface PublicCover {
  url: string;
  position: string;
}

/**
 * Cover for a public event page, or null when the cover feature is off for its org.
 * Pass `initial` (object or null) when the server already resolved it; the
 * browser fetch is then skipped.
 */
export function usePublicCover(
  eventId: string | null | undefined,
  initial?: PublicCover | null
): PublicCover | null {
  const [cover, setCover] = useState<PublicCover | null>(initial ?? null);
  const serverResolved = initial !== undefined;
  useEffect(() => {
    if (!eventId || serverResolved) return;
    let cancelled = false;
    fetch(`/api/events/${eventId}/cover`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: { coverUrl?: string | null; coverPosition?: string | null }) => {
        if (!cancelled) {
          setCover(d.coverUrl ? { url: d.coverUrl, position: coverObjectPosition(d.coverPosition) } : null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eventId, serverResolved]);
  return cover;
}
