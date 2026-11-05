import { render, screen, fireEvent, within } from "@testing-library/react";
import TimeSection from "@/components/create/sections/TimeSection";
import { INITIAL_FORM_STATE, type CreateFormState } from "@/lib/create-form-state";

function renderRsvp(extraTimes: CreateFormState["extraTimes"]) {
  const set = jest.fn();
  const state: CreateFormState = {
    ...INITIAL_FORM_STATE,
    eventType: "rsvp",
    extraTimes,
  };
  render(<TimeSection state={state} set={set} />);
  return set;
}

describe("Additional times remove button", () => {
  it("is named Remove time and removes only its own row", () => {
    const set = renderRsvp([
      { label: "Meet at church", time: "17:30" },
      { label: "Dinner", time: "18:00" },
    ]);
    const buttons = screen.getAllByRole("button", { name: "Remove time" });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(set).toHaveBeenCalledWith({ extraTimes: [{ label: "Meet at church", time: "17:30" }] });
  });

  it("sits on the label line, outside the time selects group", () => {
    renderRsvp([{ label: "", time: "" }]);
    const button = screen.getByRole("button", { name: "Remove time" });
    const group = screen.getByRole("group", { name: "Time" });
    expect(group.contains(button)).toBe(false);
    // Same line as the label input, so the 44px target never covers AM/PM.
    const labelInput = screen.getByRole("textbox", { name: "Label for additional time 1" });
    expect(button.parentElement).toBe(labelInput.parentElement);
    expect(button.className).toMatch(/\bh-11\b/);
    expect(button.className).toMatch(/\bw-11\b/);
    // Visible Time legend with the selects named from the row.
    expect(within(group).getByRole("combobox", { name: "Additional time AM or PM" })).toBeInTheDocument();
  });
});
