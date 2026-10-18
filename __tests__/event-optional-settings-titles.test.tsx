import { render, screen } from "@testing-library/react";
import EventOptionalSettings from "@/components/event/EventOptionalSettings";
import { INITIAL_FORM_STATE } from "@/lib/create-form-state";

describe("EventOptionalSettings titles", () => {
  it("uses explicit titles on the shared manage/edit stack", () => {
    render(
      <EventOptionalSettings
        state={INITIAL_FORM_STATE}
        set={() => {}}
        includeRegistration
      />,
    );

    expect(screen.getByText("Leader & timezone")).toBeInTheDocument();
    expect(screen.getByText("Guests & spots remaining")).toBeInTheDocument();
    expect(
      screen.getByText("Let people add extra names, and show how many spots are left."),
    ).toBeInTheDocument();

    expect(screen.queryByText("Event settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Registration options")).not.toBeInTheDocument();
  });

  it("omits guests & spots remaining for items events", () => {
    render(
      <EventOptionalSettings
        state={{ ...INITIAL_FORM_STATE, eventType: "items" }}
        set={() => {}}
        includeRegistration
      />,
    );

    expect(screen.getByText("Leader & timezone")).toBeInTheDocument();
    expect(screen.queryByText("Guests & spots remaining")).not.toBeInTheDocument();
  });
});
