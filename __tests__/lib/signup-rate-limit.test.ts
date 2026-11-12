/**
 * @jest-environment node
 */

import {
  clearSignupRateLimitMemory,
  consumeSignupRate,
  signupRateLimitMemorySize,
} from "@/lib/signup-rate-limit";

function req(ip = "203.0.113.10"): Request {
  return new Request("http://localhost/api/item-signups", {
    method: "POST",
    headers: { "x-vercel-forwarded-for": ip },
  });
}

const t0 = Date.UTC(2026, 10, 12, 19, 10, 0); // 19:10 UTC, mid-hour

describe("consumeSignupRate", () => {
  const previousCap = process.env.SIGNUP_RATE_LIMIT_PER_IP_PER_HOUR;

  beforeEach(() => {
    clearSignupRateLimitMemory();
    process.env.SIGNUP_RATE_LIMIT_PER_IP_PER_HOUR = "3";
  });

  afterAll(() => {
    if (previousCap === undefined) delete process.env.SIGNUP_RATE_LIMIT_PER_IP_PER_HOUR;
    else process.env.SIGNUP_RATE_LIMIT_PER_IP_PER_HOUR = previousCap;
    clearSignupRateLimitMemory();
  });

  it("allows up to the hourly cap for one IP, then denies", () => {
    expect(consumeSignupRate(req(), t0)).toEqual({ allowed: true });
    expect(consumeSignupRate(req(), t0 + 1_000)).toEqual({ allowed: true });
    expect(consumeSignupRate(req(), t0 + 2_000)).toEqual({ allowed: true });
    expect(consumeSignupRate(req(), t0 + 3_000)).toEqual({ allowed: false });
  });

  it("tracks different IPs separately", () => {
    expect(consumeSignupRate(req("203.0.113.10"), t0).allowed).toBe(true);
    expect(consumeSignupRate(req("203.0.113.11"), t0).allowed).toBe(true);
    expect(signupRateLimitMemorySize()).toBe(2);
    expect(consumeSignupRate(req("203.0.113.10"), t0).allowed).toBe(true);
    expect(consumeSignupRate(req("203.0.113.10"), t0).allowed).toBe(true);
    expect(consumeSignupRate(req("203.0.113.10"), t0).allowed).toBe(false);
    expect(consumeSignupRate(req("203.0.113.11"), t0).allowed).toBe(true);
  });

  it("resets at the next hour bucket", () => {
    expect(consumeSignupRate(req(), t0).allowed).toBe(true);
    expect(consumeSignupRate(req(), t0).allowed).toBe(true);
    expect(consumeSignupRate(req(), t0).allowed).toBe(true);
    expect(consumeSignupRate(req(), t0).allowed).toBe(false);
    const nextHour = Date.UTC(2026, 10, 12, 20, 0, 0);
    expect(consumeSignupRate(req(), nextHour)).toEqual({ allowed: true });
  });

  it("fails open when reading the client IP throws", () => {
    const broken = {
      headers: { get() { throw new Error("header parse blew up"); } },
    } as unknown as Request;
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(consumeSignupRate(broken, t0)).toEqual({ allowed: true });
      expect(err).toHaveBeenCalled();
    } finally {
      err.mockRestore();
    }
  });
});
