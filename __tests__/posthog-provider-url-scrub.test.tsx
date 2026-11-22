/**
 * The scrub only helps if PostHogProvider actually wires it into posthog.init.
 */
const init = jest.fn();

jest.mock("posthog-js", () => ({ __esModule: true, default: { init } }));
jest.mock("posthog-js/react", () => ({ PostHogProvider: ({ children }: { children: unknown }) => children }));
jest.mock("@/lib/attribution", () => ({ initAttributionTracking: jest.fn() }));

describe("PostHogProvider auth URL scrub wiring", () => {
  let config: {
    before_send: (e: unknown) => { properties: Record<string, unknown>; $set_once?: Record<string, unknown> } | null;
    session_recording: { maskCapturedNetworkRequestFn: (r: { name: string }) => { name: string } };
  };

  beforeAll(() => {
    jest.isolateModules(() => {
      require("@/components/PostHogProvider");
    });
    expect(init).toHaveBeenCalledTimes(1);
    config = init.mock.calls[0][1];
  });

  it("before_send strips token_hash from a callback pageview", () => {
    const out = config.before_send({
      event: "$pageview",
      uuid: "u",
      properties: { $current_url: "https://x.test/auth/callback?token_hash=fake123&type=magiclink" },
      $set_once: { $initial_current_url: "https://x.test/auth/callback?token_hash=fake123&type=magiclink" },
    });
    expect(out).not.toBeNull();
    expect(JSON.stringify(out)).not.toContain("fake123");
    expect(out?.properties.$current_url).toContain("type=magiclink");
  });

  it("before_send still scrubs exceptions and drops /demo events", () => {
    const ex = config.before_send({
      event: "$exception",
      uuid: "u",
      properties: { $exception_message: "failed for a@b.co", $current_url: "https://x.test/x?code=abc" },
    });
    expect(JSON.stringify(ex)).not.toMatch(/a@b\.co|code=abc/);
    expect(config.before_send({ event: "$pageview", uuid: "u", properties: { $current_url: "https://x.test/demo/1" } })).toBeNull();
  });

  it("replay URL masking hook removes the token", () => {
    const masked = config.session_recording.maskCapturedNetworkRequestFn({
      name: "https://x.test/auth/callback?token_hash=fake123&type=magiclink",
    });
    expect(masked.name).not.toContain("fake123");
    expect(masked.name).toContain("type=magiclink");
  });
});
