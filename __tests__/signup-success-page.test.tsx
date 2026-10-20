import { act, render, screen } from "@testing-library/react";
import SignupSuccessPage from "@/app/signup-success/[token]/page";
import { saveSignupSuccessInfo } from "@/lib/signup-success-handoff";

jest.mock("next/navigation", () => ({
  useParams: () => ({ token: "tok-1" }),
  useSearchParams: () => new URLSearchParams("event=camp-1"),
}));
jest.mock("posthog-js/react", () => ({ usePostHog: () => null }));

const info = {
  member_name: "Jane",
  guest_names: [],
  campaign_name: "Ward Cleaning",
  slot_label: "Sat, Oct 24, 2026 · 9:00 AM – 10:00 AM",
  event_url: "http://localhost/event/camp-1",
  session_date: "2026-10-24",
  session_time: "09:00",
  session_end_time: "10:00",
  event_timezone: "America/Denver",
  event_end_date: null,
};

describe("signup success page", () => {
  let resolveLookup: (v: unknown) => void;

  beforeEach(() => {
    sessionStorage.clear();
    global.fetch = jest.fn(
      () => new Promise((res) => { resolveLookup = res; }),
    ) as unknown as typeof fetch;
  });

  it("renders the confirmation from the handoff before the lookup returns", async () => {
    saveSignupSuccessInfo("tok-1", info);
    render(<SignupSuccessPage />);

    expect(screen.getByText(/You.re signed up!/)).toBeInTheDocument();
    expect(screen.getByText("Ward Cleaning")).toBeInTheDocument();
    expect(screen.getByTestId("cancel-link-placeholder")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Remove my signup/ })).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith("/api/signups/cancel/lookup?token=tok-1");

    await act(async () => resolveLookup({ json: () => Promise.resolve(info) }));

    expect(screen.getByRole("link", { name: /Remove my signup/ })).toHaveAttribute("href", "/cancel/tok-1");
    expect(screen.queryByTestId("cancel-link-placeholder")).toBeNull();
  });

  it("falls back to the lookup when there is no handoff (email links)", async () => {
    render(<SignupSuccessPage />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    await act(async () => resolveLookup({ json: () => Promise.resolve(info) }));

    expect(screen.getByText(/You.re signed up!/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Remove my signup/ })).toBeInTheDocument();
  });
});
