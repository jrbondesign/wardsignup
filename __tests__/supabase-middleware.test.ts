/**
 * @jest-environment node
 */

import { isProtectedPath } from "@/lib/supabase/middleware";

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
