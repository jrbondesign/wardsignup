import { act, renderHook } from "@testing-library/react";
import { CAPTCHA_LOAD_FAILED, CAPTCHA_NOT_READY, useCaptcha } from "@/lib/use-captcha";

describe("useCaptcha (public signup forms)", () => {
  afterEach(() => jest.useRealTimers());

  it("off without a site key: getToken resolves null right away and reset is a no-op", async () => {
    const { result } = renderHook(() => useCaptcha(null));
    expect(result.current.enabled).toBe(false);
    await expect(result.current.getToken()).resolves.toBeNull();
    act(() => result.current.reset());
    expect(result.current.resetKey).toBe(0);
  });

  it("a fast click waits for the invisible check instead of failing", async () => {
    const { result } = renderHook(() => useCaptcha("site"));
    let got: string | null | undefined;
    const p = result.current.getToken(5000).then((t) => (got = t));
    act(() => result.current.onToken("tok-1"));
    await p;
    expect(got).toBe("tok-1");
  });

  it("gives up after the timeout with a clear retry message", async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useCaptcha("site"));
    const p = result.current.getToken(1000);
    act(() => jest.advanceTimersByTime(1000));
    await expect(p).resolves.toBeNull();
    expect(result.current.missingMessage).toBe(CAPTCHA_NOT_READY);
    expect(CAPTCHA_NOT_READY).not.toMatch(/[\u2013\u2014]/);
  });

  it("an expired token is dropped; the refreshed one is used", async () => {
    const { result } = renderHook(() => useCaptcha("site"));
    act(() => result.current.onToken("old"));
    act(() => result.current.onToken(null)); // expired-callback
    const p = result.current.getToken(5000);
    act(() => result.current.onToken("fresh"));
    await expect(p).resolves.toBe("fresh");
  });

  it("reset after a submit clears the single use token and resets the widget", async () => {
    const { result } = renderHook(() => useCaptcha("site"));
    act(() => result.current.onToken("used"));
    act(() => result.current.reset());
    expect(result.current.token).toBeNull();
    expect(result.current.resetKey).toBe(1);
  });

  it("a widget that can't load says so", () => {
    const { result } = renderHook(() => useCaptcha("site"));
    act(() => result.current.onError());
    expect(result.current.failed).toBe(true);
    expect(result.current.missingMessage).toBe(CAPTCHA_LOAD_FAILED);
    act(() => result.current.onToken("ok"));
    expect(result.current.failed).toBe(false);
  });
});
