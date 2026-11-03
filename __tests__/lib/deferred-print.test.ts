import { printAfterPaint } from "@/lib/deferred-print";

describe("printAfterPaint", () => {
  it("does not print synchronously; prints after a frame and a macrotask", () => {
    const frames: FrameRequestCallback[] = [];
    const timers: (() => void)[] = [];
    const print = jest.fn();
    const win = {
      print,
      requestAnimationFrame: jest.fn((cb: FrameRequestCallback) => {
        frames.push(cb);
        return 1;
      }),
      setTimeout: jest.fn((cb: () => void) => {
        timers.push(cb);
        return 1;
      }),
    } as unknown as Pick<Window, "print" | "requestAnimationFrame" | "setTimeout">;

    printAfterPaint(win);
    expect(print).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);

    frames[0](0);
    expect(print).not.toHaveBeenCalled();
    expect(timers).toHaveLength(1);

    timers[0]();
    expect(print).toHaveBeenCalledTimes(1);
  });
});
