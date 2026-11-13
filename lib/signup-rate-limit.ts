import { createHash } from "crypto";
import { getClientIp } from "@/lib/request-ip";
import { getSignupRateLimitPerIpPerHour } from "@/lib/limits";

/**
 * Per-IP hourly signup cap shared by item, slot, and bulk signup routes.
 *
 * This used to be a Postgres RPC (try_consume_signup_rate). That write ran
 * on every signup, took an advisory lock, and was itself a source of 503s
 * when the database stalled. The limiter now lives in process memory: no
 * extra service, no new env vars. Each serverless instance has its own
 * counter, so the cap is an approximation; Turnstile remains the bot gate.
 * Errors fail open so a limiter bug cannot block a real signup.
 */

export const SIGNUP_RATE_LIMITED_MESSAGE =
  "Too many signups from this network. Please try again later.";

const MAX_TRACKED_KEYS = 10_000;

type Bucket = { count: number; bucketStartMs: number };

const buckets = new Map<string, Bucket>();

function hashIp(ip: string): string {
  const salt = process.env.RATE_LIMIT_IP_SALT || "wardsignup_signup_rate";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function hourBucketStartMs(nowMs: number): number {
  const d = new Date(nowMs);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function prune(currentBucketStartMs: number): void {
  for (const [key, entry] of buckets) {
    if (entry.bucketStartMs !== currentBucketStartMs) buckets.delete(key);
  }
}

/** Test-only: empty the in-memory buckets. */
export function clearSignupRateLimitMemory(): void {
  buckets.clear();
}

/** Test-only: how many IPs are currently tracked. */
export function signupRateLimitMemorySize(): number {
  return buckets.size;
}

export type SignupRateLimitResult = { allowed: true } | { allowed: false };

export function consumeSignupRate(
  request: Request,
  nowMs: number = Date.now(),
): SignupRateLimitResult {
  try {
    const max = getSignupRateLimitPerIpPerHour();
    const start = hourBucketStartMs(nowMs);
    const key = hashIp(getClientIp(request));
    const existing = buckets.get(key);

    if (!existing || existing.bucketStartMs !== start) {
      if (buckets.size >= MAX_TRACKED_KEYS) {
        prune(start);
        if (buckets.size >= MAX_TRACKED_KEYS) {
          const oldest = buckets.keys().next().value;
          if (oldest !== undefined) buckets.delete(oldest);
        }
        if (buckets.size >= MAX_TRACKED_KEYS) return { allowed: true };
      }
      buckets.set(key, { count: 1, bucketStartMs: start });
      return { allowed: true };
    }

    if (existing.count >= max) return { allowed: false };
    existing.count += 1;
    return { allowed: true };
  } catch (err) {
    console.error("signup rate limit failed open:", err);
    return { allowed: true };
  }
}
