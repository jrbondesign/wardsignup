import { useState } from "react";
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

/** Stateful host so TimeInput's unfinished picks live through re-renders, like the real form. */
function renderStateful(extraTimes: CreateFormState["extraTimes"]) {
  const latest: { state: CreateFormState | null } = { state: null };
  function Host() {
    const [state, setState] = useState<CreateFormState>({
      ...INITIAL_FORM_STATE,
      eventType: "rsvp",
      extraTimes,
      expanded: { ...INITIAL_FORM_STATE.expanded, extraTimes: true },
    });
    latest.state = state;
    return <TimeSection state={state} set={(patch) => setState((s) => ({ ...s, ...patch }))} />;
  }
  render(<Host />);
  return latest;
}

const pick = (name: string, value: string) =>
  fireEvent.change(screen.getByRole("combobox", { name }), { target: { value } });

describe("Additional times remove button", () => {
  it("gives each Remove a distinct name and removes only its own row", () => {
    const set = renderRsvp([
      { label: "Meet at church", time: "17:30" },
      { label: "Dinner", time: "18:00" },
      { label: "  ", time: "" },
    ]);
    expect(screen.getByRole("button", { name: "Remove Meet at church time" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove additional time 3" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Dinner time" }));
    expect(set).toHaveBeenCalledWith({
      extraTimes: [
        { label: "Meet at church", time: "17:30" },
        { label: "  ", time: "" },
      ],
    });
  });

  it("adds the row number when two rows share a label", () => {
    renderRsvp([
      { label: "Meet at church", time: "17:30" },
      { label: "meet at church ", time: "18:00" },
      { label: "Dinner", time: "19:00" },
    ]);
    const names = screen
      .getAllByRole("button", { name: /^Remove / })
      .map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual([
      "Remove Meet at church time (row 1)",
      "Remove meet at church time (row 2)",
      "Remove Dinner time",
    ]);
    expect(new Set(names).size).toBe(names.length);
    expect(screen.getByRole("combobox", { name: "Meet at church time (row 1) hour" })).toBeInTheDocument();
  });

  it("sits on the label line, outside the time selects group", () => {
    renderRsvp([{ label: "", time: "" }]);
    const button = screen.getByRole("button", { name: "Remove additional time 1" });
    const group = screen.getByRole("group", { name: "Time" });
    expect(group.contains(button)).toBe(false);
    // Same line as the label input, so the 44px target never covers AM/PM.
    const labelInput = screen.getByRole("textbox", { name: "Label for additional time 1" });
    expect(button.parentElement).toBe(labelInput.parentElement);
    expect(button.className).toMatch(/\bh-11\b/);
    expect(button.className).toMatch(/\bw-11\b/);
    expect(within(group).getByRole("combobox", { name: "Additional time 1 AM or PM" })).toBeInTheDocument();
  });
});

describe("Additional times keep their own unfinished picks when a row is removed", () => {
  it("QA repro: unfinished Choir removed, Clean up keeps hour 3 and saves 15:00", () => {
    const latest = renderStateful([
      { label: "Meet at church", time: "09:00" },
      { label: "Choir", time: "" },
      { label: "Clean up", time: "" },
    ]);
    pick("Choir time hour", "6");
    pick("Clean up time hour", "3");
    fireEvent.click(screen.getByRole("button", { name: "Remove Choir time" }));

    expect(screen.queryByRole("combobox", { name: "Choir time hour" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Clean up time hour" })).toHaveValue("3");
    expect(screen.getByRole("combobox", { name: "Clean up time minute" })).toHaveValue("00");

    pick("Clean up time AM or PM", "PM");
    expect(latest.state?.extraTimes).toEqual([
      { label: "Meet at church", time: "09:00" },
      { label: "Clean up", time: "15:00" },
    ]);
  });

  it("variant: finished Choir removed, Clean up keeps its unfinished hour 3", () => {
    const latest = renderStateful([
      { label: "Choir", time: "" },
      { label: "Clean up", time: "" },
    ]);
    pick("Choir time hour", "6");
    pick("Choir time AM or PM", "PM");
    expect(latest.state?.extraTimes[0]).toEqual({ label: "Choir", time: "18:00" });
    pick("Clean up time hour", "3");
    fireEvent.click(screen.getByRole("button", { name: "Remove Choir time" }));

    expect(screen.getByRole("combobox", { name: "Clean up time hour" })).toHaveValue("3");
    pick("Clean up time AM or PM", "PM");
    expect(latest.state?.extraTimes).toEqual([{ label: "Clean up", time: "15:00" }]);
  });
});
