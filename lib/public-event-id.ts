/**
 * Public event ids are UUIDs. A link pasted into a weekly program can pick up
 * a line break or space in the middle of the id (`%0A`, `%0D`, `%09`, `%20`,
 * or the whitespace itself). Strip only that whitespace, then keep the same
 * UUID check as before. Letter case is left as it arrived.
 */

/** Same shape the public event page has always accepted. Case insensitive. */
export const PUBLIC_EVENT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Suffixes of `/event/[id]` that are real public routes. Anything else is not rewritten. */
const PUBLIC_EVENT_SUFFIXES = new Set(["", "/flyer", "/opengraph-image"]);

export function isPublicEventUuid(id: string): boolean {
  return PUBLIC_EVENT_UUID_RE.test(id);
}

/**
 * Remove whitespace from an event id: literal spaces, tabs, and newlines, plus
 * percent-encoded whitespace (`%0A`, `%0D`, `%09`, `%20`), including one or
 * more `%25` layers (`%250A`). Other encodings stay in place so validation is
 * not loosened past whitespace.
 */
export function cleanEventId(raw: string): string {
  let s = raw;
  // A fresh regex each pass so lastIndex cannot skip a later call.
  // Each pass peels one layer. A global replace already clears every
  // non-overlapping token; the loop covers a token revealed by an earlier one.
  for (let i = 0; i < 4; i++) {
    const next = s.replace(/%(?:25)*(?:0a|0d|09|20)/gi, "");
    if (next === s) break;
    s = next;
  }
  return s.replace(/\s+/g, "");
}

/**
 * When `pathname` is a public event route and its id is a UUID once whitespace
 * is removed, and that id is not already the raw segment, return the canonical
 * path plus the original query string. Otherwise null (no redirect).
 */
export function canonicalPublicEventRedirect(pathname: string, search = ""): string | null {
  const match = /^\/event\/([^/?#]+)(\/[^?#]*)?$/.exec(pathname);
  if (!match) return null;
  const raw = match[1];
  const suffix = (match[2] ?? "").replace(/\/+$/, "");
  if (!PUBLIC_EVENT_SUFFIXES.has(suffix)) return null;
  const cleaned = cleanEventId(raw);
  if (!isPublicEventUuid(cleaned) || cleaned === raw) return null;
  const qs = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  return `/event/${cleaned}${suffix}${qs}`;
}

/** Absolute URL for a 308, or null when the request should continue unchanged. */
export function publicEventRedirectTarget(requestUrl: string): URL | null {
  const url = new URL(requestUrl);
  const path = canonicalPublicEventRedirect(url.pathname, url.search);
  if (!path) return null;
  const dest = new URL(url.href);
  const q = path.indexOf("?");
  dest.pathname = q === -1 ? path : path.slice(0, q);
  dest.search = q === -1 ? "" : path.slice(q);
  return dest;
}

/** Rebuild a query string from a page's searchParams without dropping repeated keys. */
export function queryStringFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") params.append(key, value);
    else if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    }
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}
