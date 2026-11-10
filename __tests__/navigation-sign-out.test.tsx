import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Navigation from "@/components/Navigation";

const mockReset = jest.fn();
const mockSignOut = jest.fn();
const mockPush = jest.fn();

jest.mock("@/lib/posthog-client", () => ({ resetPostHogOnSignOut: () => mockReset() }));
jest.mock("@/lib/auth", () => ({
  createClientComponentClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "u1", email: "leader@example.org" } } }),
      signOut: () => mockSignOut(),
    },
  }),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: jest.fn() }) }));
jest.mock("posthog-js/react", () => ({ usePostHog: () => ({ capture: jest.fn() }) }));
jest.mock("@/components/BrandProvider", () => ({ useBrand: () => ({ name: "WardSignup", logoSrc: "/logo.png" }) }));
jest.mock("next/image", () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ unoptimized, ...props }: Record<string, unknown>) => <img {...(props as object)} />,
}));

describe("Navigation sign out", () => {
  beforeEach(() => {
    mockReset.mockReset();
    mockSignOut.mockReset();
    mockPush.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  async function signOutButton() {
    render(<Navigation />);
    const buttons = await screen.findAllByRole("button", { name: "Sign Out" });
    return buttons[0];
  }

  it("resets PostHog when sign out succeeds", async () => {
    mockSignOut.mockResolvedValue({ error: null });
    fireEvent.click(await signOutButton());
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it("does not reset PostHog when sign out returns an error", async () => {
    mockSignOut.mockResolvedValue({ error: { message: "network down" } });
    fireEvent.click(await signOutButton());
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
    expect(mockReset).not.toHaveBeenCalled();
  });
});
