import { SupabaseTimeoutError, withSupabaseTimeout } from "@/lib/supabase-timeout";

describe("withSupabaseTimeout", () => {
  afterEach(() => jest.useRealTimers());

  it("resolves with the call's result when it finishes in time", async () => {
    await expect(withSupabaseTimeout(Promise.resolve({ data: 1, error: null }), "x")).resolves.toEqual({
      data: 1,
      error: null,
    });
  });

  it("rejects with SupabaseTimeoutError once the limit passes", async () => {
    jest.useFakeTimers();
    const p = withSupabaseTimeout(new Promise(() => {}), "slow", 10_000);
    const check = expect(p).rejects.toBeInstanceOf(SupabaseTimeoutError);
    await jest.advanceTimersByTimeAsync(10_000);
    await check;
  });

  it("aborts the signal when the call is a function and the limit passes", async () => {
    jest.useFakeTimers();
    let seen: AbortSignal | undefined;
    const p = withSupabaseTimeout((signal) => {
      seen = signal;
      return new Promise(() => {});
    }, "slow", 10_000);
    const check = expect(p).rejects.toBeInstanceOf(SupabaseTimeoutError);
    await jest.advanceTimersByTimeAsync(10_000);
    await check;
    expect(seen?.aborted).toBe(true);
  });

  it("does not leave an unhandled rejection when the aborted call later fails", async () => {
    jest.useFakeTimers();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      const p = withSupabaseTimeout((signal) => {
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
      }, "slow", 10_000);
      const check = expect(p).rejects.toBeInstanceOf(SupabaseTimeoutError);
      await jest.advanceTimersByTimeAsync(10_000);
      await check;
      await Promise.resolve();
      await Promise.resolve();
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
