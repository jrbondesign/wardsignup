/** Hosted Vercel production (not preview, not local). */
export function isHostedProduction(): boolean {
  if (process.env.VERCEL_ENV === "production") return true;
  if (process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "development") {
    return false;
  }
  return process.env.NODE_ENV === "production";
}

export function isLocalDevelopment(): boolean {
  return process.env.NODE_ENV === "development" && process.env.VERCEL_ENV !== "production";
}
