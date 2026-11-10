import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimeInput, { TimeRangeRow } from "@/components/TimeInput";
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

describe("TimeInput behavior", () => {
  it("defaults minute to 00 when hour is picked", async () => {
    const user = userEvent.setup();
    render(<Harness initial="" />);
    await user.selectOptions(screen.getByLabelText("Start hour"), "7");
    expect(screen.getByLabelText("Start minute")).toHaveValue("00");
    expect(screen.getByTestId("stored")).toHaveTextContent("(empty)");
    expect(screen.getByText(/Pick hour, minute, and AM or PM/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Start AM or PM"), "PM");
    expect(screen.getByTestId("stored")).toHaveTextContent("19:00");
  });

  it("does not wipe hour when minute is cleared", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByTestId("stored")).toHaveTextContent("16:30");
    await user.selectOptions(screen.getByLabelText("Start minute"), "");
    expect(screen.getByTestId("stored")).toHaveTextContent("(empty)");
    expect(screen.getByLabelText("Start hour")).toHaveValue("4");
    expect(screen.getByLabelText("Start AM or PM")).toHaveValue("PM");
    expect(screen.getByText(/Pick hour, minute, and AM or PM/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Start minute"), "15");
    expect(screen.getByTestId("stored")).toHaveTextContent("16:15");
  });

  it("loads 12 AM correctly", () => {
    render(<Harness initial="00:00" />);
    expect(screen.getByLabelText("Start hour")).toHaveValue("12");
    expect(screen.getByLabelText("Start minute")).toHaveValue("00");
    expect(screen.getByLabelText("Start AM or PM")).toHaveValue("AM");
    expect(screen.getByTestId("stored")).toHaveTextContent("00:00");
  });

  it("loads 12 PM correctly and flips to AM as 00:00", async () => {
    const user = userEvent.setup();
    render(<Harness initial="12:00" />);
    expect(screen.getByLabelText("Start hour")).toHaveValue("12");
    expect(screen.getByLabelText("Start AM or PM")).toHaveValue("PM");
    await user.selectOptions(screen.getByLabelText("Start AM or PM"), "AM");
    expect(screen.getByTestId("stored")).toHaveTextContent("00:00");
  });

  it("starts blank with Hour, Minute, AM/PM placeholders and no default AM", () => {
    render(<Harness initial="" />);
    expect(screen.getByLabelText("Start hour")).toHaveValue("");
    expect(screen.getByLabelText("Start minute")).toHaveValue("");
    expect(screen.getByLabelText("Start AM or PM")).toHaveValue("");
    expect(screen.getByRole("option", { name: "AM/PM" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Minute" })).toBeInTheDocument();
  });

  it("shows a visible legend and names the selects from it", () => {
    render(
      <TimeInput value="09:30" onChange={() => {}} label="End time" labelNote="(optional)" />
    );
    const group = screen.getByRole("group", { name: "End time (optional)" });
    expect(group.closest("fieldset")).not.toBeNull();
    expect(screen.getByText("End time")).toBeVisible();
    expect(screen.getByLabelText("End time hour")).toHaveValue("9");
    expect(screen.getByLabelText("End time minute")).toHaveValue("30");
    expect(screen.getByLabelText("End time AM or PM")).toHaveValue("AM");
  });

  it("keeps a more specific aria label for the selects when one is given", () => {
    render(
      <TimeInput
        value=""
        onChange={() => {}}
        label="Start time"
        ariaLabel="Start time for Fri, Nov 20"
      />
    );
    expect(screen.getByRole("group", { name: "Start time" })).toBeInTheDocument();
    expect(screen.getByLabelText("Start time for Fri, Nov 20 hour")).toBeInTheDocument();
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
