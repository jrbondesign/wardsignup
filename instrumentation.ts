/**
 * Next.js server instrumentation. onRequestError reports errors that escape a
 * route handler, page or server action (including crons) to PostHog error
 * tracking. Handled errors that return a 500 are reported explicitly with
 * captureServerException in their catch blocks.
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
    const header = request.headers["x-posthog-distinct-id"];
    captureServerException(err, {
      route: context.routePath || request.path.split("?")[0],
      distinctId: typeof header === "string" ? header : null,
      properties: { method: request.method, route_type: context.routeType, router_kind: context.routerKind, unhandled: true },
    });
    await flushPostHogSafely();
  } catch {
    // never let error reporting throw
  }
}
