"use client";

import { useEffect, useState } from "react";

/** Cover URL for a public event page, or null when the cover feature is off for its org. */
export function usePublicCover(eventId: string | null | undefined): string | null {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    fetch(`/api/events/${eventId}/cover`)
      .then((r) => (r.ok ? r.json() : { coverUrl: null }))
      .then((d: { coverUrl?: string | null }) => {
        if (!cancelled) setCoverUrl(d.coverUrl ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eventId]);
  return coverUrl;
}
