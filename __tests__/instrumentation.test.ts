/**
 * @jest-environment node
 */
const mockCapture = jest.fn();
jest.mock("@/lib/posthog-server", () => ({
  captureServerException: (...args: unknown[]) => mockCapture(...args),
  flushPostHogSafely: jest.fn().mockResolvedValue(undefined),
}));

import { onRequestError, unverifiedClientDistinctId } from "@/instrumentation";

const ctx = { routerKind: "App Router", routePath: "/api/signups", routeType: "route" };

describe("onRequestError", () => {
  const prevRuntime = process.env.NEXT_RUNTIME;
  beforeEach(() => {
    mockCapture.mockReset();
    process.env.NEXT_RUNTIME = "nodejs";
  });
  afterAll(() => {
    if (prevRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = prevRuntime;
  });

  it("never uses the client header as the person id, only as an unverified property", async () => {
    const err = new Error("boom");
    await onRequestError(err, { path: "/api/signups?x=1", method: "POST", headers: { "x-posthog-distinct-id": "victim-user-id" } }, ctx);
    expect(mockCapture).toHaveBeenCalledTimes(1);
    const [sent, context] = mockCapture.mock.calls[0];
    expect(sent).toBe(err);
    expect(context.distinctId).toBeUndefined();
    expect(context.route).toBe("/api/signups");
    expect(context.properties).toEqual(
      expect.objectContaining({ client_distinct_id: "victim-user-id", distinct_id_verified: false, unhandled: true, method: "POST" }),
    );
  });

  it("drops a header value that isn't a plain id", async () => {
    await onRequestError(new Error("x"), { path: "/p", method: "GET", headers: { "x-posthog-distinct-id": "jane@example.org" } }, ctx);
    expect(mockCapture.mock.calls[0][1].properties.client_distinct_id).toBeNull();
  });

  it("does nothing outside the nodejs runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    await onRequestError(new Error("x"), { path: "/p", method: "GET", headers: {} }, ctx);
    expect(mockCapture).not.toHaveBeenCalled();
  });
});

describe("unverifiedClientDistinctId", () => {
  it("accepts PostHog style ids and rejects everything else", () => {
    expect(unverifiedClientDistinctId("0192f1c2-aaaa-7bbb-8ccc-1234567890ab")).toBe("0192f1c2-aaaa-7bbb-8ccc-1234567890ab");
    expect(unverifiedClientDistinctId(undefined)).toBeNull();
    expect(unverifiedClientDistinctId(["a", "b"])).toBeNull();
    expect(unverifiedClientDistinctId("a@b.co")).toBeNull();
    expect(unverifiedClientDistinctId("x".repeat(101))).toBeNull();
    expect(unverifiedClientDistinctId("")).toBeNull();
  });
});
