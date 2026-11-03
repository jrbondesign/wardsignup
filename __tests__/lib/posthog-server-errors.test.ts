/**
 * @jest-environment node
 */
const mockAfter = jest.fn();
jest.mock("next/server", () => ({ after: (fn: () => unknown) => mockAfter(fn) }));
jest.mock("posthog-node", () => ({ PostHog: jest.fn() }));

import { captureServerException, flushPostHogSafely } from "@/lib/posthog-server";

beforeEach(() => mockAfter.mockReset());

describe("flushPostHogSafely", () => {
  it("resolves when flush rejects", async () => {
    await expect(flushPostHogSafely(50, { flush: () => Promise.reject(new Error("down")) })).resolves.toBeUndefined();
  });
  it("resolves when flush throws synchronously", async () => {
    await expect(flushPostHogSafely(50, { flush: () => { throw new Error("boom"); } })).resolves.toBeUndefined();
  });
  it("gives up after the timeout when flush hangs", async () => {
    const start = Date.now();
    await flushPostHogSafely(30, { flush: () => new Promise<void>(() => {}) });
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe("captureServerException", () => {
  it("captures with route context and schedules a flush after the response", async () => {
    const client = { captureException: jest.fn(), flush: jest.fn().mockResolvedValue(undefined) };
    const err = new Error("db down");
    captureServerException(err, { route: "/api/signups", distinctId: "abc", properties: { campaign_id: "c1" } }, client as never);
    expect(client.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "db down", name: "Error" }),
      "abc",
      expect.objectContaining({ route: "/api/signups", campaign_id: "c1", runtime: "server" }),
    );
    expect(mockAfter).toHaveBeenCalledTimes(1);
    await mockAfter.mock.calls[0][0]();
    expect(client.flush).toHaveBeenCalled();
  });
  it("scrubs emails and tokens from the message, stack and string properties before capture", () => {
    const client = { captureException: jest.fn(), flush: jest.fn().mockResolvedValue(undefined) };
    const err = new Error("Resend rejected to=jane@example.org with key re_AbCdEf123456789012345678");
    captureServerException(err, { route: "/api/signups", properties: { note: "for bob@example.com", count: 2 } }, client as never);
    const [sent, distinctId, props] = client.captureException.mock.calls[0];
    expect(sent).toBeInstanceOf(Error);
    expect(sent).not.toBe(err);
    expect(sent.message).toBe("Resend rejected to=[email] with key [secret]");
    expect(sent.stack).not.toContain("jane@example.org");
    expect(sent.stack).not.toContain("re_AbCdEf");
    expect(distinctId).toBeUndefined();
    expect(props).toEqual(expect.objectContaining({ note: "for [email]", count: 2 }));
    expect(err.message).toContain("jane@example.org");
  });
  it("scrubs non Error values such as PostgREST error objects", () => {
    const client = { captureException: jest.fn(), flush: jest.fn().mockResolvedValue(undefined) };
    captureServerException({ code: "23505", message: "Key (email)=(a@b.co) already exists" }, { route: "/api/x" }, client as never);
    expect(client.captureException.mock.calls[0][0].message).toBe("Key (email)=([redacted]) already exists");
  });
  it("falls back to a direct flush outside a request scope", async () => {
    mockAfter.mockImplementation(() => { throw new Error("after() outside request scope"); });
    const client = { captureException: jest.fn(), flush: jest.fn().mockResolvedValue(undefined) };
    expect(() => captureServerException(new Error("x"), { route: "cron:test" }, client as never)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(client.flush).toHaveBeenCalled();
  });
  it("never throws when PostHog itself throws", () => {
    const client = { captureException: () => { throw new Error("sdk"); }, flush: jest.fn() };
    expect(() => captureServerException(new Error("x"), { route: "/api/x" }, client as never)).not.toThrow();
  });
  it("is a no-op without a PostHog key", () => {
    const prev = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    expect(() => captureServerException(new Error("x"), { route: "/api/x" })).not.toThrow();
    expect(mockAfter).not.toHaveBeenCalled();
    if (prev !== undefined) process.env.NEXT_PUBLIC_POSTHOG_KEY = prev;
  });
});
