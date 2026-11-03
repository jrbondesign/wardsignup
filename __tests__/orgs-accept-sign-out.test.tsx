import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AcceptInvitePage from "@/app/orgs/accept/page";

const mockReset = jest.fn();
const mockSignOut = jest.fn();
const mockRefresh = jest.fn();

// Stable objects: the page's effect depends on router and posthog identity.
const mockRouter = { push: jest.fn(), refresh: () => mockRefresh() };
const mockPosthog = { capture: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams("token=tok-1"),
}));
jest.mock("posthog-js/react", () => ({ usePostHog: () => mockPosthog }));
jest.mock("@/lib/posthog-client", () => ({ resetPostHogOnSignOut: () => mockReset() }));
jest.mock("@/components/Navigation", () => ({ __esModule: true, default: () => null }));
jest.mock("@/lib/auth", () => ({
  createClientComponentClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "jwt", user: { id: "u1", email: "other@example.org" } } },
      }),
      signOut: () => mockSignOut(),
    },
  }),
}));

function setFetch() {
  global.fetch = jest.fn(async (url: string) => {
    const reply =
      url === "/api/organizations/invite-info"
        ? { status: 200, body: { organizationName: "Maple Ridge Ward", maskedInvitedEmail: "l***@example.org" } }
        : url === "/api/organizations/accept"
          ? { status: 403, body: { error: "Email mismatch" } }
          : { status: 200, body: {} };
    return { ok: reply.status < 300, status: reply.status, json: async () => reply.body } as Response;
  }) as unknown as typeof fetch;
}

async function switchAccountButton() {
  setFetch();
  render(<AcceptInvitePage />);
  fireEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));
  return screen.findByRole("button", { name: "Switch account" });
}

describe("/orgs/accept Switch account", () => {
  beforeEach(() => {
    mockReset.mockReset();
    mockSignOut.mockReset();
    mockRefresh.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("resets PostHog after a successful sign out", async () => {
    mockSignOut.mockResolvedValue({ error: null });
    fireEvent.click(await switchAccountButton());
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it("keeps the PostHog identity when sign out fails", async () => {
    mockSignOut.mockResolvedValue({ error: { message: "network down" } });
    fireEvent.click(await switchAccountButton());
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(mockReset).not.toHaveBeenCalled();
  });
});
