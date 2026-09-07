import { createHash } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { getClientIp } from "@/lib/request-ip";

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

function hourBucket(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: "rate_limited" }
  | { allowed: true; reason: "unconfigured" };

/**
 * Per-IP per-hour rate limit for unauthenticated endpoints.
 * Returns allowed=true if the request should proceed. If the service role is
 * not configured we fail open (allowed=true, reason="unconfigured") so local
 * dev without env doesn't break — production should always have it set.
 */
export async function consumeActionRate(
  action: string,
  request: Request,
  maxPerHour: number,
): Promise<RateLimitResult> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { allowed: true, reason: "unconfigured" };
  }
  const admin = createServiceRoleClient();
  const ip = getClientIp(request);
  const { data, error } = await admin.rpc("try_consume_action_rate", {
    p_action: action,
    p_ip_hash: hashIp(ip),
    p_bucket: hourBucket(),
    p_max: maxPerHour,
  } as never);
  if (error) {
    // FAIL CLOSED: these limits mostly guard endpoints that send email. A DB
    // blip briefly blocking an action beats it briefly unlimiting every
    // sender at once. (Missing env still fails open above for local dev.)
    console.error(`rate limit RPC error for ${action} (failing closed):`, error);
    return { allowed: false, reason: "rate_limited" };
  }
  if (data === false) return { allowed: false, reason: "rate_limited" };
  return { allowed: true };
}

/**
 * Cron idempotency: returns true at most once per (job, bucket).
 * Bucket should match the cron's natural cadence (e.g. hour for hourly jobs,
 * day for daily). Used to prevent CRON_SECRET replay from triggering a second
 * pass within the same scheduled window.
 */
export async function claimCronRun(
  job: string,
  bucket: Date,
): Promise<{ claimed: boolean; reason?: string }> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || !supabaseUrl) {
    // Still fail-open for local dev without env, but log loudly — a production
    // deploy missing these would skip idempotency and risk double-sends.
    console.error("cron claim unconfigured: missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL");
    return { claimed: true, reason: "unconfigured" };
  }
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc("try_claim_cron_run", {
    p_job: job,
    p_bucket: bucket.toISOString(),
  } as never);
  if (error) {
    // FAIL CLOSED: cron claims guard bulk email sends. If we can't prove this
    // is the first run of the bucket, we must assume it is not — a skipped run
    // self-heals next bucket, but a double-run double-emails everyone.
    console.error(`cron claim RPC error for ${job} (failing closed):`, error);
    return { claimed: false, reason: "unconfigured" };
  }
  return { claimed: data === true };
}

export function hourBucketDate(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d;
}

export function dayBucketDate(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
