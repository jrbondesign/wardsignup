import { act, fireEvent, render, screen } from "@testing-library/react";
import CancelSignupPage from "@/app/cancel/[token]/page";

jest.mock("next/navigation", () => ({
  useParams: () => ({ token: "not-a-real-token-xyz" }),
}));

const ERROR_BODY = { error: "Something went wrong." };
const FOUND_BODY = {
  member_name: "Pat",
  campaign_name: "Ward dinner",
  slot_label: "Tue 9:00 AM",
  event_url: "http://localhost/event/camp-1",
};

function jsonResponse(body: unknown) {
  return { json: () => Promise.resolve(body) };
}

describe("cancel page Try again", () => {
  let resolveLookup: (v: unknown) => void;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn(
      () =>
        new Promise((res) => {
          resolveLookup = res;
        }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("retries the lookup and returns to the error card when the token is still bad", async () => {
    render(<CancelSignupPage />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    await act(async () => resolveLookup(jsonResponse(ERROR_BODY)));

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/signups/cancel/lookup?token=not-a-real-token-xyz",
    );

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/signups/cancel/lookup?token=not-a-real-token-xyz",
    );

    await act(async () => resolveLookup(jsonResponse(ERROR_BODY)));

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("retries the lookup and shows the signup when a temporary failure recovers", async () => {
    render(<CancelSignupPage />);

    await act(async () => resolveLookup(jsonResponse(ERROR_BODY)));
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => resolveLookup(jsonResponse(FOUND_BODY)));

    expect(screen.getByRole("heading", { name: "Cancel your signup" })).toBeInTheDocument();
    expect(screen.getByText("Pat")).toBeInTheDocument();
    expect(screen.getByText("Ward dinner")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});
