/**
 * Best-effort client IP for rate limiting.
 *
 * Prefers `x-vercel-forwarded-for`, which Vercel's edge sets and clients cannot
 * forge. Falls back to `x-real-ip` / first `x-forwarded-for` entry for other
 * hosts — when self-hosting, make sure your proxy overwrites those headers.
 */
export function getClientIp(request: Request): string {
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) {
    const first = vercel.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}
