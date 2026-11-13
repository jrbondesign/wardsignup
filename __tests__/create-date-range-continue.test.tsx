/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

jest.mock("@/lib/auth", () => ({
  createClientComponentClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: "tok" } } }),
    },
  }),
}));

jest.mock("@/lib/attribution", () => ({ getStoredAttribution: () => undefined }));

jest.mock("@/components/create/EventTypePicker", () => () => <div data-testid="event-type-picker" />);
jest.mock("@/components/create/sections/LocationSection", () => () => null);
jest.mock("@/components/create/sections/CapacitySection", () => () => null);
jest.mock("@/components/create/sections/AttendeeFieldsSection", () => () => null);
jest.mock("@/components/create/sections/ItemsSection", () => () => null);
jest.mock("@/components/create/sections/VisibilitySection", () => () => null);
jest.mock("@/components/create/sections/NotificationsSection", () => () => null);
jest.mock("@/components/create/sections/GoogleCalendarSection", () => () => null);
jest.mock("@/components/create/sections/EventSettingsSection", () => () => null);
jest.mock("@/components/create/sections/HeardAboutSection", () => () => null);

import UnifiedCreateForm from "@/components/create/UnifiedCreateForm";
import { DATE_RANGE_MISSING_ERROR } from "@/lib/date-range-selection";

function dayButton(day: number) {
  return screen.getByRole("button", { name: new RegExp(`^${day}(?:,|$)`) });
}

describe("Create form Continue with an incomplete date range", () => {
  const scrollIntoView = jest.fn();

  beforeEach(() => {
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
    (global as any).fetch = jest.fn();
  });

  it("keeps Continue enabled, shows an inline calendar error, and focuses the calendar", async () => {
    const user = userEvent.setup();
    render(<UnifiedCreateForm initialTemplateKey="tithing-declaration" />);

    const continueBtn = screen.getByRole("button", { name: /Continue/ });
    expect(continueBtn).toBeEnabled();

    await user.click(continueBtn);

    const alert = screen.getByTestId("date-range-missing-error");
    expect(alert).toHaveTextContent(DATE_RANGE_MISSING_ERROR);
    expect(alert).toHaveAttribute("role", "alert");
    expect(screen.queryByText("Pick a date range for the slots")).not.toBeInTheDocument();

    const calendar = document.getElementById("create-date-range-calendar");
    expect(calendar).toBeTruthy();
    expect(calendar).toHaveClass("ws-date-range-error");
    expect(document.activeElement).toBe(calendar);
    expect(scrollIntoView).toHaveBeenCalled();
    expect(continueBtn).toBeEnabled();
  });

  it("re-scrolls and re-rings on a second Continue tap, then clears on the first calendar tap", async () => {
    const user = userEvent.setup();
    render(<UnifiedCreateForm initialTemplateKey="tithing-declaration" />);
    const continueBtn = screen.getByRole("button", { name: /Continue/ });

    await user.click(continueBtn);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    const calendar = document.getElementById("create-date-range-calendar")!;
    expect(calendar.getAttribute("data-error-pulse")).toBe("1");

    await user.click(continueBtn);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(calendar.getAttribute("data-error-pulse")).toBe("2");
    expect(screen.getByTestId("date-range-missing-error")).toBeInTheDocument();

    await user.click(dayButton(16));
    expect(screen.queryByTestId("date-range-missing-error")).not.toBeInTheDocument();
    expect(calendar).not.toHaveClass("ws-date-range-error");
    expect(calendar.getAttribute("aria-describedby")).toBeNull();
    expect(calendar.getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByText("Now tap the end date.")).toBeInTheDocument();

    await user.click(dayButton(21));
    expect(screen.queryByTestId("date-range-missing-error")).not.toBeInTheDocument();
    expect(calendar).not.toHaveClass("ws-date-range-error");
  });

  it("shows the Schedule card in the neutral slots wording", () => {
    render(<UnifiedCreateForm initialTemplateKey="tithing-declaration" />);
    expect(
      screen.getByText("When slots run and how they are generated."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/sessions/i)).not.toBeInTheDocument();
  });
});
