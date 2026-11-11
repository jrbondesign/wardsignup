import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimeInput, { TimeRangeRow, draftClockLabel, minuteChoices, visualViewportOverlayStyle } from "@/components/TimeInput";
import { formatTime12h, subtreeHasInvalidTimeSelect } from "@/lib/utils";
import { useState } from "react";

function Harness({ initial = "16:30" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div>
      <TimeInput value={value} onChange={setValue} ariaLabel="Start" required />
      <output data-testid="stored">{value || "(empty)"}</output>
    </div>
  );
}

describe("TimeInput time sheet (Option A)", () => {
  const field = (re: RegExp | string = /^Start, /) => screen.getByRole("button", { name: re });
  const sheet = () => screen.getByRole("dialog");

  it("shows the saved value in fixed 12 hour form on the closed field", () => {
    render(<Harness initial="19:00" />);
    expect(field("Start, 7:00 PM")).toHaveAttribute("aria-haspopup", "dialog");
    expect(field()).toHaveTextContent("7:00 PM");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("opens a modal sheet with focus on the selected hour", async () => {
    const user = userEvent.setup();
    render(<Harness initial="15:00" />);
    await user.click(field());
    const dialog = sheet();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Start");
    const three = within(dialog).getByRole("button", { name: "3 o'clock" });
    expect(three).toHaveAttribute("aria-pressed", "true");
    expect(three).toHaveFocus();
    expect(within(dialog).getByRole("button", { name: "PM" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "AM" })).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByRole("button", { name: "00 minutes" })).toHaveAttribute("aria-pressed", "true");
    expect(field()).toHaveAttribute("aria-expanded", "true");
  });

  it("header shows --:-- when nothing is picked, then live numbers next to AM/PM", async () => {
    const user = userEvent.setup();
    render(<Harness initial="" />);
    await user.click(field());
    const dialog = sheet();
    const preview = within(dialog).getByTestId("time-sheet-preview");
    expect(preview).toHaveTextContent("--:--");
    expect(preview).toHaveAccessibleName("No time selected yet");
    // The clock and the AM/PM toggle share one header row.
    const meridiem = within(dialog).getByRole("group", { name: "AM or PM" });
    expect(preview.parentElement).toContainElement(meridiem);
    await user.click(within(dialog).getByRole("button", { name: "7 o'clock" }));
    expect(preview).toHaveTextContent("7:00");
    expect(preview).toHaveAccessibleName("Selected time 7:00");
    await user.click(within(dialog).getByRole("button", { name: "30 minutes" }));
    expect(preview).toHaveTextContent("7:30");
  });

  it("header shows the saved time in large numbers when the sheet opens", async () => {
    const user = userEvent.setup();
    render(<Harness initial="19:00" />);
    await user.click(field());
    const preview = within(sheet()).getByTestId("time-sheet-preview");
    expect(preview).toHaveTextContent("7:00");
    expect(within(sheet()).getByRole("button", { name: "PM" })).toHaveAttribute("aria-pressed", "true");
  });

  it("from blank: 7, PM, Set stores 19:00 (minute defaults to :00)", async () => {
    const user = userEvent.setup();
    render(<Harness initial="" />);
    expect(field("Start, not set")).toHaveTextContent("Choose time");
    await user.click(field());
    const dialog = sheet();
    const set = within(dialog).getByRole("button", { name: "Set time" });
    expect(set).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "7 o'clock" }));
    expect(within(dialog).getByRole("button", { name: "00 minutes" })).toHaveAttribute("aria-pressed", "true");
    // Hour without AM/PM is a draft: nothing is stored and Set stays disabled.
    expect(screen.getByTestId("stored")).toHaveTextContent("(empty)");
    expect(within(dialog).getByRole("button", { name: "Set time" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "PM" }));
    await user.click(within(dialog).getByRole("button", { name: "Set 7:00 PM" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("stored")).toHaveTextContent("19:00");
    expect(field("Start, 7:00 PM")).toHaveFocus();
  });

  it("hour and minute without AM/PM never reach the form: Set stays off and a submit is blocked", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Harness initial="" />
        <button type="submit">Save event</button>
      </form>
    );
    await user.click(field());
    const dialog = sheet();
    await user.click(within(dialog).getByRole("button", { name: "7 o'clock" }));
    await user.click(within(dialog).getByRole("button", { name: "30 minutes" }));
    // Neither AM nor PM is preselected for a new time.
    expect(within(dialog).getByRole("button", { name: "AM" })).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByRole("button", { name: "PM" })).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByTestId("time-sheet-preview")).toHaveTextContent("7:30");
    const set = within(dialog).getByRole("button", { name: "Set time" });
    expect(set).toBeDisabled();
    await user.click(set);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("stored")).toHaveTextContent("(empty)");
    // Closing the sheet throws the draft away; the required blank field blocks the submit.
    await user.click(screen.getByTestId("time-sheet-backdrop"));
    expect(screen.getByTestId("stored")).toHaveTextContent("(empty)");
    await user.click(screen.getByRole("button", { name: "Save event" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Choose a time.")).toBeInTheDocument();
  });

  it("from a preset, picking a minute and Set changes only what was picked", async () => {
    const user = userEvent.setup();
    render(<Harness initial="16:30" />);
    await user.click(field());
    await user.click(within(sheet()).getByRole("button", { name: "45 minutes" }));
    await user.click(within(sheet()).getByRole("button", { name: "Set 4:45 PM" }));
    expect(screen.getByTestId("stored")).toHaveTextContent("16:45");
  });

  it("Cancel keeps the old value and returns focus to the field", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<TimeInput value="15:00" onChange={onChange} label="Start time" />);
    await user.click(screen.getByRole("button", { name: "Start time, 3:00 PM" }));
    await user.click(within(sheet()).getByRole("button", { name: "9 o'clock" }));
    await user.click(within(sheet()).getByRole("button", { name: "AM" }));
    await user.click(within(sheet()).getByRole("button", { name: "Cancel" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Start time, 3:00 PM" })).toHaveFocus();
    // Reopening starts from the saved value, not the abandoned draft.
    await user.click(screen.getByRole("button", { name: "Start time, 3:00 PM" }));
    expect(within(sheet()).getByRole("button", { name: "3 o'clock" })).toHaveAttribute("aria-pressed", "true");
  });

  it("Escape and a tap on the backdrop close without changing the value", async () => {
    const user = userEvent.setup();
    render(<Harness initial="15:00" />);
    await user.click(field());
    await user.click(within(sheet()).getByRole("button", { name: "8 o'clock" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("stored")).toHaveTextContent("15:00");
    expect(field()).toHaveFocus();

    await user.click(field());
    await user.click(within(sheet()).getByRole("button", { name: "8 o'clock" }));
    await user.click(screen.getByTestId("time-sheet-backdrop"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("stored")).toHaveTextContent("15:00");
  });

  it("traps Tab focus inside the sheet", async () => {
    const user = userEvent.setup();
    render(<Harness initial="15:00" />);
    await user.click(field());
    const dialog = sheet();
    const set = within(dialog).getByRole("button", { name: "Set 3:00 PM" });
    set.focus();
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(set).toHaveFocus();
  });

  it("arrow keys move within a group and p picks PM", async () => {
    const user = userEvent.setup();
    render(<Harness initial="" />);
    await user.click(field());
    const dialog = sheet();
    expect(within(dialog).getByRole("button", { name: "1 o'clock" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(within(dialog).getByRole("button", { name: "2 o'clock" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard("p");
    expect(within(dialog).getByRole("button", { name: "PM" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(dialog).getByRole("button", { name: "Set 2:00 PM" }));
    expect(screen.getByTestId("stored")).toHaveTextContent("14:00");
  });

  it("flags a half picked draft with data-time-partial so edit forms can't save it", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initial="" />);
    expect(container.querySelector('[data-time-partial="true"]')).toBeNull();
    await user.click(field());
    await user.click(within(sheet()).getByRole("button", { name: "7 o'clock" }));
    expect(container.querySelector('[data-time-partial="true"]')).not.toBeNull();
    expect(subtreeHasInvalidTimeSelect(container)).toBe(true);
    const validity = container.querySelector<HTMLInputElement>("input[data-time-validity]")!;
    expect(validity.validationMessage).toBe("Finish choosing hour, minute, and AM or PM.");
    await user.keyboard("{Escape}");
    expect(container.querySelector('[data-time-partial="true"]')).toBeNull();
    expect(screen.getByTestId("stored")).toHaveTextContent("(empty)");
  });

  it("skips the custom validity message when nativeValidity is false", async () => {
    const user = userEvent.setup();
    const { container } = render(<TimeInput value="" onChange={() => {}} ariaLabel="Start" nativeValidity={false} />);
    await user.click(screen.getByRole("button", { name: "Start, not set" }));
    await user.click(within(sheet()).getByRole("button", { name: "7 o'clock" }));
    expect(container.querySelector('[data-time-partial="true"]')).not.toBeNull();
    expect(container.querySelector<HTMLInputElement>("input[data-time-validity]")!.validationMessage).toBe("");
  });

  it("a blank required field is invalid for native form checks", () => {
    const { container } = render(<Harness initial="" />);
    expect(subtreeHasInvalidTimeSelect(container)).toBe(true);
  });

  it("keeps a saved time that is off the 15 minute grid (7:10 PM) unless changed", async () => {
    const user = userEvent.setup();
    render(<Harness initial="19:10" />);
    expect(field("Start, 7:10 PM")).toBeInTheDocument();
    await user.click(field());
    const ten = within(sheet()).getByRole("button", { name: "10 minutes" });
    expect(ten).toHaveAttribute("aria-pressed", "true");
    // Changing the hour keeps :10.
    await user.click(within(sheet()).getByRole("button", { name: "8 o'clock" }));
    await user.click(within(sheet()).getByRole("button", { name: "Set 8:10 PM" }));
    expect(screen.getByTestId("stored")).toHaveTextContent("20:10");
  });

  it("shows an odd minute (7:07) as its own chip and keeps it on Set", async () => {
    const user = userEvent.setup();
    render(<Harness initial="07:07" />);
    await user.click(field("Start, 7:07 AM"));
    expect(within(sheet()).getByRole("button", { name: "07 minutes" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(sheet()).getByRole("button", { name: "Set 7:07 AM" }));
    expect(screen.getByTestId("stored")).toHaveTextContent("07:07");
  });

  it("Show every 5 minutes reveals :05 to :55", async () => {
    const user = userEvent.setup();
    render(<Harness initial="19:00" />);
    await user.click(field());
    expect(within(sheet()).queryByRole("button", { name: "05 minutes" })).toBeNull();
    await user.click(within(sheet()).getByRole("button", { name: "Show every 5 minutes" }));
    await user.click(within(sheet()).getByRole("button", { name: "55 minutes" }));
    await user.click(within(sheet()).getByRole("button", { name: "Set 7:55 PM" }));
    expect(screen.getByTestId("stored")).toHaveTextContent("19:55");
  });

  it("round trips 12 AM and 12 PM", async () => {
    const user = userEvent.setup();
    render(<Harness initial="12:00" />);
    expect(field("Start, 12:00 PM")).toBeInTheDocument();
    await user.click(field());
    await user.click(within(sheet()).getByRole("button", { name: "AM" }));
    await user.click(within(sheet()).getByRole("button", { name: "Set 12:00 AM" }));
    expect(screen.getByTestId("stored")).toHaveTextContent("00:00");
  });

  it("an optional field can be cleared; a required one has no Clear", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const { rerender } = render(<TimeInput value="17:00" onChange={onChange} label="End time" />);
    await user.click(screen.getByRole("button", { name: "End time, 5:00 PM" }));
    await user.click(within(sheet()).getByRole("button", { name: "Clear time" }));
    expect(onChange).toHaveBeenCalledWith("");
    rerender(<TimeInput value="17:00" onChange={onChange} label="End time" required />);
    await user.click(screen.getByRole("button", { name: "End time, 5:00 PM" }));
    expect(within(sheet()).queryByRole("button", { name: "Clear time" })).toBeNull();
  });

  it("every sheet button is at least 44px (min-h-11)", async () => {
    const user = userEvent.setup();
    render(<Harness initial="19:00" />);
    await user.click(field());
    for (const b of within(sheet()).getAllByRole("button")) {
      expect(b.className).toMatch(/\bmin-h-1[12]\b/);
    }
  });

  it("does nothing when disabled", async () => {
    const user = userEvent.setup();
    render(<TimeInput value="19:00" onChange={() => {}} ariaLabel="Start" disabled />);
    await user.click(screen.getByRole("button", { name: "Start, 7:00 PM" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows a visible legend and names the field from it", () => {
    render(
      <TimeInput value="09:30" onChange={() => {}} label="End time" labelNote="(optional)" />
    );
    const group = screen.getByRole("group", { name: "End time (optional)" });
    expect(group.closest("fieldset")).not.toBeNull();
    expect(screen.getByText("End time")).toBeVisible();
    expect(screen.getByRole("button", { name: "End time, 9:30 AM" })).toBeInTheDocument();
  });

  it("keeps a more specific aria label when one is given", () => {
    render(
      <TimeInput
        value=""
        onChange={() => {}}
        label="Start time"
        ariaLabel="Start time for Fri, Nov 20"
      />
    );
    expect(screen.getByRole("group", { name: "Start time" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start time for Fri, Nov 20, not set" })).toBeInTheDocument();
  });
});

describe("draftClockLabel", () => {
  it("uses --:-- until hour and minute are picked", () => {
    expect(draftClockLabel({ hour12: "", minute: "", meridiem: "" })).toBe("--:--");
    expect(draftClockLabel({ hour12: "7", minute: "", meridiem: "PM" })).toBe("7:--");
    expect(draftClockLabel({ hour12: "", minute: "15", meridiem: "" })).toBe("--:15");
    expect(draftClockLabel({ hour12: "7", minute: "00", meridiem: "PM" })).toBe("7:00");
  });
});

describe("minuteChoices", () => {
  it("adds an off-grid minute in order", () => {
    expect(minuteChoices("10", false)).toEqual(["00", "10", "15", "30", "45"]);
    expect(minuteChoices("30", false)).toEqual(["00", "15", "30", "45"]);
    expect(minuteChoices("07", true)).toContain("07");
  });
});

describe("formatTime12h", () => {
  it.each([
    ["00:00", "12:00 AM"],
    ["00:15", "12:15 AM"],
    ["12:00", "12:00 PM"],
    ["12:30", "12:30 PM"],
    ["19:00", "7:00 PM"],
    ["23:45", "11:45 PM"],
  ])("%s → %s", (hhmm, text) => {
    expect(formatTime12h(hhmm)).toBe(text);
  });
});

describe("TimeRangeRow", () => {
  it("renders Start, a to separator, and End in order", () => {
    const { container } = render(
      <TimeRangeRow
        start={<TimeInput value="" onChange={() => {}} label="Start time" labelNote="(required)" />}
        end={<TimeInput value="" onChange={() => {}} label="End time" labelNote="(optional)" />}
      />
    );
    const text = container.textContent ?? "";
    expect(text.indexOf("Start time")).toBeLessThan(text.indexOf("to"));
    expect(text.indexOf("to", text.indexOf("Start time"))).toBeLessThan(text.indexOf("End time"));
    expect(screen.getAllByRole("group")).toHaveLength(2);
  });
});

describe("visualViewportOverlayStyle", () => {
  it("covers the visible screen and is a no-op transform at normal zoom", () => {
    expect(visualViewportOverlayStyle({ offsetLeft: 0, offsetTop: 0, width: 390, height: 844, scale: 1 })).toEqual({
      left: 0,
      top: 0,
      right: "auto",
      bottom: "auto",
      width: 390,
      height: 844,
      transform: undefined,
      transformOrigin: "0 0",
    });
  });

  it("when iOS zooms the page out, keeps the sheet at screen size over the visible part", () => {
    const style = visualViewportOverlayStyle({ offsetLeft: 24, offsetTop: 10, width: 450, height: 1000, scale: 0.8 });
    expect(style).toMatchObject({ left: 24, top: 10, width: 360, height: 800, transform: "scale(1.25)" });
  });

  it("treats a missing or zero scale as 1", () => {
    expect(visualViewportOverlayStyle({ offsetLeft: 0, offsetTop: 0, width: 320, height: 600, scale: 0 })).toMatchObject({
      width: 320,
      transform: undefined,
    });
  });
});
