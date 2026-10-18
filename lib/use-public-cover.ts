"use client";

import { useEffect, useState } from "react";
import { coverObjectPosition } from "@/lib/cover-position";

export interface PublicCover {
  url: string;
  position: string;
}

/** Cover for a public event page, or null when the cover feature is off for its org. */
export function usePublicCover(eventId: string | null | undefined): PublicCover | null {
  const [cover, setCover] = useState<PublicCover | null>(null);
  useEffect(() => {
    if (!eventId) return;
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
  }, [eventId]);
  return cover;
}
