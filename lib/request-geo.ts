/**
 * Approximate location from Vercel's IP geolocation headers
 * (x-vercel-ip-city, x-vercel-ip-country-region, x-vercel-ip-country).
 * Vercel URL encodes the city. Returns "City, ST" for the US, "City, Region, CC"
 * elsewhere, or null when nothing useful is present.
 */
type HeaderSource = { get(name: string): string | null };

function clean(v: string | null): string {
  if (!v) return "";
  let s = v;
  try {
    s = decodeURIComponent(v.replace(/\+/g, " "));
  } catch {
    // keep raw value
  }
  s = s.trim();
  return /^[\p{L}\p{N} .,'()]{1,80}$/u.test(s) ? s : "";
}

export function locationFromVercelHeaders(h: HeaderSource): string | null {
  const city = clean(h.get("x-vercel-ip-city"));
  const region = clean(h.get("x-vercel-ip-country-region")).toUpperCase();
  const country = clean(h.get("x-vercel-ip-country")).toUpperCase();

  const parts: string[] = [];
  if (city) parts.push(city);
  if (region) parts.push(region);
  if (country && country !== "US") parts.push(country);
  if (!city && !region) return null;
  return parts.join(", ");
}

export function formatLocationLine(location: string | null | undefined): string {
  return location?.trim() ? `Location: ${location.trim()}` : "Location unknown";
}
