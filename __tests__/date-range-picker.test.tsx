/**
 * @jest-environment jsdom
 */
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DateRangePicker from "@/components/DateRangePicker";

function Harness() {
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  return (
    <DateRangePicker
      rangeStart={start}
      rangeEnd={end}
      initialMonth={new Date(2027, 2, 1)}
      onChange={(s, e) => {
        setStart(s);
        setEnd(e);
      }}
    />
  );
}

function dayButton(day: number) {
  return screen.getByRole("button", { name: new RegExp(`^${day}(?:,|$)`) });
}

describe("DateRangePicker range mode", () => {
  it("tags the start day and updates the footer after the first tap", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText("Tap a start date")).toBeInTheDocument();

    await user.click(dayButton(15));

    expect(dayButton(15)).toHaveAccessibleName("15, Start");
    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(
      screen.getByText(/Start: Mon, Mar 15\./),
    ).toBeInTheDocument();
    expect(screen.getByText("Now tap the end date.")).toBeInTheDocument();
    expect(dayButton(15)).toHaveClass("bg-[#08647E]");
    expect(dayButton(15)).toHaveClass("text-white");
  });

  it("keeps a distinct start fill once the range is complete", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(dayButton(15));
    await user.click(dayButton(20));

    expect(dayButton(15)).not.toHaveClass("bg-[#08647E]");
    expect(dayButton(20)).toHaveClass("bg-[#08647E]");
    expect(dayButton(20)).toHaveClass("text-white");
  });

  it("does not wipe a complete range when an in-range day is tapped", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(dayButton(15));
    await user.click(dayButton(20));

    expect(screen.getByText("Mon, Mar 15 to Sat, Mar 20")).toBeInTheDocument();
    expect(screen.getByText("6 days")).toBeInTheDocument();
    expect(dayButton(20)).toHaveAccessibleName("20, End");

    await user.click(dayButton(17));

    expect(screen.getByText("Wed, Mar 17 to Sat, Mar 20")).toBeInTheDocument();
    expect(screen.queryByText("Now tap the end date.")).not.toBeInTheDocument();
    expect(dayButton(17)).toHaveAccessibleName("17, Start");
    expect(dayButton(20)).toHaveAccessibleName("20, End");
  });

  it("moves the start and keeps the end when a day before the start is tapped", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(dayButton(15));
    await user.click(dayButton(20));
    await user.click(dayButton(14));

    expect(screen.getByText("Sun, Mar 14 to Sat, Mar 20")).toBeInTheDocument();
    expect(dayButton(14)).toHaveAccessibleName("14, Start");
  });
});
