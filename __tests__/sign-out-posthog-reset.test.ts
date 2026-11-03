
const mockReset = jest.fn();
const mockSignOut = jest.fn();

jest.mock("@/lib/posthog-client", () => ({
  resetPostHogOnSignOut: () => mockReset(),
  posthogDistinctIdHeader: () => ({}),
}));
jest.mock("@supabase/ssr", () => ({
  createBrowserClient: () => ({ auth: { signOut: () => mockSignOut() } }),
}));

beforeEach(() => {
  mockReset.mockReset();
  mockSignOut.mockReset();

  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("lib/auth signOut", () => {
  it("resets PostHog after a successful sign out", async () => {
    const { signOut } = await import("@/lib/auth");
    mockSignOut.mockResolvedValue({ error: null });
    await expect(signOut()).resolves.toEqual({ error: null });
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it("keeps the PostHog identity when sign out fails", async () => {
    const { signOut } = await import("@/lib/auth");
    const error = { message: "network down" };
    mockSignOut.mockResolvedValue({ error });
    await expect(signOut()).resolves.toEqual({ error });
    expect(mockReset).not.toHaveBeenCalled();
  });
});
