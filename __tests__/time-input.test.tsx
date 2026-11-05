import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimeInput from "@/components/TimeInput";
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

  it("starts blank with Hour Min AM/PM placeholders and no default AM", () => {
    render(<Harness initial="" />);
    expect(screen.getByLabelText("Start hour")).toHaveValue("");
    expect(screen.getByLabelText("Start minute")).toHaveValue("");
    expect(screen.getByLabelText("Start AM or PM")).toHaveValue("");
    expect(screen.getByRole("option", { name: "AM/PM" })).toBeInTheDocument();
  });
});
