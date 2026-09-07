import { toDate } from "date-fns-tz";

/** Fallback when `campaigns.event_timezone` is null or invalid (set in deployment env). */
export function getDefaultEventTimezone(): string {
  const t = process.env.DEFAULT_EVENT_TIMEZONE?.trim();
  return t || "America/Phoenix";
}

let supportedZones: Set<string> | null = null;

function getSupportedIanaZones(): Set<string> {
  if (supportedZones) return supportedZones;
  try {
    const list =
      typeof Intl !== "undefined" &&
      "supportedValuesOf" in Intl &&
      typeof (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf ===
        "function"
        ? (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf(
            "timeZone",
          )
        : null;
    if (list && list.length > 0) {
      supportedZones = new Set(list);
      return supportedZones;
    }
  } catch {
    /* ignore */
  }
  supportedZones = new Set([
    "America/Phoenix",
    "America/Denver",
    "America/Los_Angeles",
    "America/New_York",
    "America/Chicago",
    "UTC",
  ]);
  return supportedZones;
}

export function isValidIanaTimezone(zone: string): boolean {
  const z = zone.trim();
  if (!z) return false;
  return getSupportedIanaZones().has(z);
}

/**
 * Prefer campaign.event_timezone when valid; otherwise default env (and log in caller if invalid).
 */
export function resolveEffectiveEventTimezone(eventTimezone: string | null | undefined): string {
  const raw = eventTimezone?.trim();
  if (raw && isValidIanaTimezone(raw)) return raw;
  return getDefaultEventTimezone();
}

/**
 * Interpret `session_date` (YYYY-MM-DD) + `time` (HH:mm from `<input type="time">`) as wall time
 * in `ianaZone` and return the instant in UTC.
 */
export function sessionStartUtc(
  sessionDate: string,
  timeHHmm: string,
  ianaZone: string,
): Date {
  const raw = ianaZone?.trim();
  const zone =
    raw && isValidIanaTimezone(raw) ? raw : getDefaultEventTimezone();
  const t = timeHHmm.trim();
  const timePart = t.length === 5 ? `${t}:00` : t;
  const isoLocal = `${sessionDate.trim()}T${timePart}`;
  return toDate(isoLocal, { timeZone: zone });
}
