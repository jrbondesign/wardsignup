import { render, screen, waitFor } from "@testing-library/react";
import AcceptInvitePage from "@/app/orgs/accept/page";

const mockRouter = { push: jest.fn(), refresh: jest.fn() };
const mockPosthog = { capture: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams("token=tok-1"),
}));
jest.mock("posthog-js/react", () => ({ usePostHog: () => mockPosthog }));
jest.mock("@/lib/posthog-client", () => ({ resetPostHogOnSignOut: jest.fn() }));
jest.mock("@/components/Navigation", () => ({ __esModule: true, default: () => null }));

const mockGetSession = jest.fn();
jest.mock("@/lib/auth", () => ({
  createClientComponentClient: () => ({
    auth: { getSession: () => mockGetSession() },
  }),
}));

function jsonRes(status: number, body: unknown) {
  return {
    ok: status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("/orgs/accept invite error states", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockPosthog.capture.mockReset();
  });

  it("tells a signed out visitor a used invite needs a new link and offers sign in", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    global.fetch = jest.fn(async () =>
      jsonRes(410, { error: "This invitation has already been used", alreadyMember: false }),
    ) as unknown as typeof fetch;

    render(<AcceptInvitePage />);

    expect(await screen.findByRole("heading", { name: "Invitation already used" })).toBeInTheDocument();
    expect(screen.getByText("This invite was already used. Ask your admin for a new link.")).toBeInTheDocument();
    expect(screen.getByText("If you already joined, sign in here.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByText(/l\*\*\*@/)).not.toBeInTheDocument();
  });

  it("tells the signed in member they are already in and sends them to the dashboard", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "jwt", user: { id: "u1", email: "me@example.org" } } },
    });
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/organizations/invite-info") {
        expect(String((init?.headers as Record<string, string>)?.Authorization ?? "")).toContain("Bearer jwt");
        return jsonRes(410, { error: "This invitation has already been used", alreadyMember: true });
      }
      return jsonRes(200, {});
    }) as unknown as typeof fetch;

    render(<AcceptInvitePage />);

    expect(await screen.findByRole("heading", { name: "You're already in" })).toBeInTheDocument();
    expect(screen.getByText("You're already in this organization. Go to your dashboard.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to your dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("explains expired and revoked invites with a next step and no other user info", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    global.fetch = jest.fn(async () =>
      jsonRes(410, { error: "This invitation has expired" }),
    ) as unknown as typeof fetch;
    const first = render(<AcceptInvitePage />);
    expect(await screen.findByRole("heading", { name: "Invitation expired" })).toBeInTheDocument();
    expect(screen.getByText("This invite has expired. Ask your admin for a new link.")).toBeInTheDocument();
    first.unmount();

    global.fetch = jest.fn(async () =>
      jsonRes(410, { error: "This invitation has been revoked" }),
    ) as unknown as typeof fetch;
    render(<AcceptInvitePage />);
    expect(await screen.findByRole("heading", { name: "Invitation revoked" })).toBeInTheDocument();
    expect(screen.getByText("This invite is no longer active. Ask your admin for a new link.")).toBeInTheDocument();
    expect(screen.queryByText(/@example/)).not.toBeInTheDocument();
  });

  it("explains a missing invite without exposing another person", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    global.fetch = jest.fn(async () =>
      jsonRes(404, { error: "Invitation not found or expired" }),
    ) as unknown as typeof fetch;
    render(<AcceptInvitePage />);
    expect(await screen.findByRole("heading", { name: "Invitation not found" })).toBeInTheDocument();
    expect(screen.getByText("This invite link is not valid. Ask your admin for a new link.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/already in/i)).not.toBeInTheDocument());
  });
});
