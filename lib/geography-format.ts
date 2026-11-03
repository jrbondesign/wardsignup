/**
 * "Oct 18, 2026" style date for the map label, or null when the timestamp is
 * missing or unparseable (for example the baked snapshot fallback).
 */
export function formatMapUpdatedDate(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Phoenix",
  });
}
