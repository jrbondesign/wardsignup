/**
 * Curated IANA zones for organizer event timezone UI (US-heavy + UTC).
 * Full list available via Intl.supportedValuesOf("timeZone") in modern browsers.
 */
export const COMMON_EVENT_TIMEZONES: { value: string; label: string }[] = [
  { value: "America/Honolulu", label: "Honolulu" },
  { value: "America/Anchorage", label: "Anchorage" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Boise", label: "Mountain (Boise)" },
  { value: "America/Detroit", label: "Eastern (Detroit)" },
  { value: "UTC", label: "UTC" },
];
