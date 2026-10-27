import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AcceptInvitePage from "@/app/orgs/accept/page";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams("token=tok-1"),
}));
jest.mock("posthog-js/react", () => ({ usePostHog: () => ({ capture: jest.fn() }) }));
jest.mock("@/components/Navigation", () => ({ __esModule: true, default: () => null }));
jest.mock("@/lib/auth", () => ({
  createClientComponentClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "jwt", user: { id: "u1", email: "leader@example.org" } } },
      }),
      signOut: jest.fn(),
    },
  }),
}));

type Reply = { status: number; body?: unknown } | Error;

function setFetch(calling: Reply) {
  const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    let r: Reply;
    if (url === "/api/organizations/invite-info") {
      r = { status: 200, body: { organizationName: "Maple Ridge Ward", maskedInvitedEmail: "l***@example.org" } };
    } else if (url === "/api/organizer-profile/calling" && (!init?.method || init.method === "GET")) {
      r = { status: 200, body: { calling: null } };
    } else if (url === "/api/organizer-profile/calling") {
      r = calling;
    } else if (url === "/api/organizations/accept") {
      r = { status: 200, body: { organization_id: "org-1", destination: "/dashboard?joined=1" } };
    } else {
      throw new Error(`unexpected ${url}`);
    }
    if (r instanceof Error) throw r;
    const reply = r;
    return { ok: reply.status < 300, status: reply.status, json: async () => reply.body ?? {} } as Response;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const patchCalls = (m: jest.Mock) =>
  m.mock.calls.filter(([url, init]) => url === "/api/organizer-profile/calling" && init?.method === "PATCH");

describe("/orgs/accept asks for an optional calling", () => {
  beforeEach(() => {
    push.mockReset();
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("accepts with a calling and saves it", async () => {
    const fetchMock = setFetch({ status: 200, body: { calling: "Ward clerk" } });
    render(<AcceptInvitePage />);
    const select = await screen.findByLabelText("Your calling (optional)");
    fireEvent.change(select, { target: { value: "Ward clerk" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard?joined=1"));
    const patches = patchCalls(fetchMock);
    expect(patches).toHaveLength(1);
    expect(JSON.parse(patches[0][1].body)).toEqual({ calling: "Ward clerk" });
  });

  it("accepts with the calling left blank", async () => {
    const fetchMock = setFetch({ status: 200 });
    render(<AcceptInvitePage />);
    await screen.findByLabelText("Your calling (optional)");
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard?joined=1"));
    expect(patchCalls(fetchMock)).toHaveLength(0);
  });

  it("still accepts when saving the calling fails with 409 before the migration", async () => {
    setFetch({ status: 409, body: { code: "calling_unavailable" } });
    render(<AcceptInvitePage />);
    const select = await screen.findByLabelText("Your calling (optional)");
    fireEvent.change(select, { target: { value: "Bishop" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard?joined=1"));
  });
});
