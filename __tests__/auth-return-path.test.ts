/**
 * @jest-environment node
 */

import {
  safeReturnPath,
  consumePostAuthPath,
  AUTH_RETURN_STORAGE_KEY,
} from "@/lib/auth-return-path";

describe("safeReturnPath", () => {
  it("allows same-origin relative paths", () => {
    expect(safeReturnPath("/dashboard")).toBe("/dashboard");
    expect(safeReturnPath("/setup/abc?x=1")).toBe("/setup/abc?x=1");
  });

  it("rejects open redirects", () => {
    expect(safeReturnPath("//evil.com")).toBeNull();
    expect(safeReturnPath("https://evil.com")).toBeNull();
    expect(safeReturnPath("")).toBeNull();
  });
});

describe("consumePostAuthPath", () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
    (globalThis as unknown as { window: object }).window = {
      sessionStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
      },
    };
  });

  afterEach(() => {
    delete (globalThis as { window?: object }).window;
  });

  it("returns /dashboard when nothing stored", () => {
    expect(consumePostAuthPath()).toBe("/dashboard");
  });

  it("returns stored path and clears storage", () => {
    store[AUTH_RETURN_STORAGE_KEY] = "/create";
    expect(consumePostAuthPath()).toBe("/create");
    expect(store[AUTH_RETURN_STORAGE_KEY]).toBeUndefined();
  });
});
