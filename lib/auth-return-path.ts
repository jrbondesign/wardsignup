/** SessionStorage key: where to go after OAuth / magic link (same-origin paths only). */
export const AUTH_RETURN_STORAGE_KEY = "authReturnTo";

export function safeReturnPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  try {
    const u = new URL(raw, "http://local.invalid");
    if (u.origin !== "http://local.invalid") return null;
    return `${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

/** Read and clear the stored post-auth path; defaults to /dashboard. */
export function consumePostAuthPath(): string {
  if (typeof window === "undefined") return "/dashboard";
  const raw = window.sessionStorage.getItem(AUTH_RETURN_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_RETURN_STORAGE_KEY);
  const path = raw ? safeReturnPath(raw) : null;
  return path ?? "/dashboard";
}
