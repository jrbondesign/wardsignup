/**
 * Next.js server instrumentation. onRequestError reports errors that escape a
 * route handler, page or server action (including crons) to PostHog error
 * tracking. Handled errors that return a 500 are reported explicitly with
 * captureServerException in their catch blocks.
 *
 * The x-posthog-distinct-id header is set by the browser, so it is not trusted
 * as the person id: anyone could send someone else's id. The exception is
 * captured without a person profile, and a well formed header value is kept
 * only as the clearly labeled unverified property client_distinct_id.
 */
export function register() {}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { captureServerException, flushPostHogSafely } = await import("@/lib/posthog-server");
    captureServerException(err, {
      route: context.routePath || request.path.split("?")[0],
      properties: {
        method: request.method,
        route_type: context.routeType,
        router_kind: context.routerKind,
        unhandled: true,
        client_distinct_id: unverifiedClientDistinctId(request.headers["x-posthog-distinct-id"]),
        distinct_id_verified: false,
      },
    });
    await flushPostHogSafely();
  } catch {
    // never let error reporting throw
  }
}

/**
 * PostHog distinct ids are UUIDs or similar ids. Anything else (an email, a
 * long string, a list) is dropped so the header can't smuggle data in.
 */
export function unverifiedClientDistinctId(header: string | string[] | undefined): string | null {
  if (typeof header !== "string") return null;
  const value = header.trim();
  return /^[A-Za-z0-9._:-]{1,100}$/.test(value) ? value : null;
}
