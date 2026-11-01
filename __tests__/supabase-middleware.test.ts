/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

const mockGetClaims = jest.fn();
const mockGetUser = jest.fn();
jest.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims: mockGetClaims, getUser: mockGetUser } }),
}));

import { hasAuthCookie, isProtectedPath, updateSession, userFromClaims } from "@/lib/supabase/middleware";

describe("isProtectedPath", () => {
  it("marks organizer routes as protected", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/dashboard/x")).toBe(true);
    expect(isProtectedPath("/create")).toBe(true);
    expect(isProtectedPath("/setup/abc")).toBe(true);
    expect(isProtectedPath("/edit/abc")).toBe(true);
    expect(isProtectedPath("/admin")).toBe(true);
    expect(isProtectedPath("/admin/xyz")).toBe(true);
    expect(isProtectedPath("/admin-utils/fix-end-times")).toBe(true);
  });

  it("leaves public routes open", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/auth/callback")).toBe(false);
    expect(isProtectedPath("/event/abc")).toBe(false);
    expect(isProtectedPath("/privacy")).toBe(false);
    expect(isProtectedPath("/terms")).toBe(false);
  });
});

describe("hasAuthCookie", () => {
  it("finds the Supabase auth cookie, chunked or not", () => {
    expect(hasAuthCookie([{ name: "sb-abc-auth-token" }])).toBe(true);
    expect(hasAuthCookie([{ name: "sb-abc-auth-token.0" }])).toBe(true);
  });

  it("ignores other cookies", () => {
    expect(hasAuthCookie([])).toBe(false);
    expect(hasAuthCookie([{ name: "ph_phc_x_posthog" }])).toBe(false);
  });
});

describe("userFromClaims", () => {
  it("maps verified claims to the middleware user", () => {
    expect(userFromClaims({ sub: "u-1", email: "a@b.c" })).toEqual({ id: "u-1", email: "a@b.c" });
    expect(userFromClaims({ sub: "u-1" })).toEqual({ id: "u-1", email: undefined });
  });
  it("treats missing claims as signed out", () => {
    expect(userFromClaims(null)).toBeNull();
    expect(userFromClaims(undefined)).toBeNull();
    expect(userFromClaims({ email: "a@b.c" })).toBeNull();
    expect(userFromClaims({ sub: "" })).toBeNull();
  });
});

describe("updateSession", () => {
  const authCookie = "sb-wqmpllurnofdsfditrpo-auth-token=x";
  beforeEach(() => {
    mockGetClaims.mockReset();
    mockGetUser.mockReset();
  });

  it("skips Supabase entirely for anonymous visitors (public event pages)", async () => {
    const { user, timedOut } = await updateSession(new NextRequest("http://localhost/event/abc"));
    expect(user).toBeNull();
    expect(timedOut).toBe(false);
    expect(mockGetClaims).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("verifies the session locally with getClaims, not a getUser round trip", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: "u-1", email: "a@b.c" } }, error: null });
    const req = new NextRequest("http://localhost/dashboard", { headers: { cookie: authCookie } });
    const { user } = await updateSession(req);
    expect(user).toEqual({ id: "u-1", email: "a@b.c" });
    expect(mockGetClaims).toHaveBeenCalledTimes(1);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("treats an invalid or expired session as signed out", async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: { message: "invalid" } });
    const req = new NextRequest("http://localhost/dashboard", { headers: { cookie: authCookie } });
    expect((await updateSession(req)).user).toBeNull();
    mockGetClaims.mockRejectedValue(new Error("network"));
    expect((await updateSession(req)).user).toBeNull();
  });
});
