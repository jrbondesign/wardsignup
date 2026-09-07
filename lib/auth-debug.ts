/** Logs auth diagnostics only in development (never log tokens or URLs in production). */
export function authDebug(...args: unknown[]) {
  if (process.env.NODE_ENV === "development") {
    console.log("[auth]", ...args);
  }
}
