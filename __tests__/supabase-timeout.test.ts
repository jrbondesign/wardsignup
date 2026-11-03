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
});
