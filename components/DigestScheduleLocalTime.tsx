"use client";

import { useMemo } from "react";

/**
 * Renders 14:00 UTC (daily digest cron) in the viewer's local timezone, e.g. "9:00 AM EST".
 */
export function DigestScheduleLocalTime() {
  const label = useMemo(() => {
    const d = new Date();
    const at14Utc = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 14, 0, 0),
    );
    return at14Utc.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }, []);

  return <span className="tabular-nums">{label}</span>;
}
