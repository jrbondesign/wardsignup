import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;

export function getPostHogClient(): PostHog {
  if (!posthogClient) {
    posthogClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}

/** Max time a flush may hold a response or a cron open. */
export const POSTHOG_FLUSH_TIMEOUT_MS = 2000;

/**
 * Flush queued PostHog events. Never throws and never waits longer than
 * `timeoutMs`, so analytics can't break or stall a response.
 */
export async function flushPostHogSafely(
  timeoutMs = POSTHOG_FLUSH_TIMEOUT_MS,
  client: Pick<PostHog, "flush"> | null = null,
): Promise<void> {
  try {
    const c = client ?? (process.env.NEXT_PUBLIC_POSTHOG_KEY ? getPostHogClient() : null);
    if (!c) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.resolve()
        .then(() => c.flush())
        .catch(() => {}),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
    if (timer) clearTimeout(timer);
  } catch {
    // swallow: analytics must never break the caller
  }
}

export interface ServerExceptionContext {
  /** Route or job name, e.g. "/api/signups" or "cron:geography-refresh". */
  route: string;
  /** Browser distinct id (x-posthog-distinct-id) or user id when known. */
  distinctId?: string | null;
  /** Extra non PII properties (ids, counts, flags). Never emails, names or tokens. */
  properties?: Record<string, string | number | boolean | null | undefined>;
}

/**
 * Report a server-side exception to PostHog error tracking. Never throws.
 * The flush runs after the response via next/server after() when called in a
 * request; outside a request it is fire and forget with a timeout.
 */
export function captureServerException(
  error: unknown,
  ctx: ServerExceptionContext,
  client: Pick<PostHog, "captureException" | "flush"> | null = null,
): void {
  try {
    const c = client ?? (process.env.NEXT_PUBLIC_POSTHOG_KEY ? getPostHogClient() : null);
    if (!c) return;
    c.captureException(error, ctx.distinctId || undefined, {
      ...(ctx.properties ?? {}),
      route: ctx.route,
      runtime: "server",
      vercel_env: process.env.VERCEL_ENV ?? null,
    });
    const flush = () => flushPostHogSafely(POSTHOG_FLUSH_TIMEOUT_MS, c);
    try {
      // Required lazily so this module stays importable outside Next's server
      // runtime (jsdom tests, scripts). after() throws outside a request scope.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { after } = require("next/server") as typeof import("next/server");
      after(flush);
    } catch {
      void flush();
    }
  } catch {
    // swallow
  }
}
