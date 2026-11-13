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
      initialMonth={new Date(2026, 10, 1)}
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

    await user.click(dayButton(16));

    expect(dayButton(16)).toHaveAccessibleName("16, Start");
    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(
      screen.getByText(/Start: Mon, Nov 16\./),
    ).toBeInTheDocument();
    expect(screen.getByText("Now tap the end date.")).toBeInTheDocument();
    expect(dayButton(16)).toHaveClass("bg-[#08647E]");
    expect(dayButton(16)).toHaveClass("text-white");
  });

  it("keeps a distinct start fill once the range is complete", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(dayButton(16));
    await user.click(dayButton(21));

    expect(dayButton(16)).not.toHaveClass("bg-[#08647E]");
    expect(dayButton(21)).toHaveClass("bg-[#08647E]");
    expect(dayButton(21)).toHaveClass("text-white");
  });

  it("does not wipe a complete range when an in-range day is tapped", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(dayButton(16));
    await user.click(dayButton(21));

    expect(screen.getByText("Mon, Nov 16 to Sat, Nov 21")).toBeInTheDocument();
    expect(screen.getByText("6 days")).toBeInTheDocument();
    expect(dayButton(21)).toHaveAccessibleName("21, End");

    await user.click(dayButton(18));

    expect(screen.getByText("Wed, Nov 18 to Sat, Nov 21")).toBeInTheDocument();
    expect(screen.queryByText("Now tap the end date.")).not.toBeInTheDocument();
    expect(dayButton(18)).toHaveAccessibleName("18, Start");
    expect(dayButton(21)).toHaveAccessibleName("21, End");
  });

  it("moves the start and keeps the end when a day before the start is tapped", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(dayButton(16));
    await user.click(dayButton(21));
    await user.click(dayButton(14));

    expect(screen.getByText("Sat, Nov 14 to Sat, Nov 21")).toBeInTheDocument();
    expect(dayButton(14)).toHaveAccessibleName("14, Start");
  });
});
