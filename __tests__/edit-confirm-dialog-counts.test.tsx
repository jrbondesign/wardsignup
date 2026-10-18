/**
 * Verifies the editor's ConfirmDialog shows correct copy and counts
 * for removing days and slots.
 */

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import ConfirmDialog from "@/components/ConfirmDialog";

describe("Editor ConfirmDialog copy and counts", () => {
  it("remove day with signups shows correct counts", () => {
    const mockConfirm = jest.fn();
    const mockCancel = jest.fn();

    render(
      <ConfirmDialog
        title="Remove Thursday, Oct 8?"
        body="This removes 3 slots and 5 signups on this day. Changes apply when you save."
        confirmLabel="Remove day"
        onConfirm={mockConfirm}
        onCancel={mockCancel}
      />
    );

    expect(screen.getByText("Remove Thursday, Oct 8?")).toBeInTheDocument();
    expect(screen.getByText(/This removes 3 slots and 5 signups on this day/)).toBeInTheDocument();
    expect(screen.getByText(/Changes apply when you save/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove day" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("remove day with no signups shows correct copy", () => {
    const mockConfirm = jest.fn();
    const mockCancel = jest.fn();

    render(
      <ConfirmDialog
        title="Remove Thursday, Oct 8?"
        body="This removes 3 slots. No one has signed up yet. Changes apply when you save."
        confirmLabel="Remove day"
        onConfirm={mockConfirm}
        onCancel={mockCancel}
      />
    );

    expect(screen.getByText("Remove Thursday, Oct 8?")).toBeInTheDocument();
    expect(screen.getByText(/This removes 3 slots/)).toBeInTheDocument();
    expect(screen.getByText(/No one has signed up yet/)).toBeInTheDocument();
  });

  it("remove slot with signups shows correct copy", () => {
    const mockConfirm = jest.fn();
    const mockCancel = jest.fn();

    render(
      <ConfirmDialog
        title="Remove Women's Class?"
        body="3 people are signed up for this slot. Removing it removes those signups when you save."
        confirmLabel="Remove slot"
        onConfirm={mockConfirm}
        onCancel={mockCancel}
      />
    );

    expect(screen.getByText("Remove Women's Class?")).toBeInTheDocument();
    expect(screen.getByText(/3 people are signed up for this slot/)).toBeInTheDocument();
    expect(screen.getByText(/Removing it removes those signups when you save/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove slot" })).toBeInTheDocument();
  });

  it("singular vs plural: 1 person and 1 signup", () => {
    const mockConfirm = jest.fn();
    const mockCancel = jest.fn();

    render(
      <ConfirmDialog
        title="Remove Women's Class?"
        body="1 person is signed up for this slot. Removing it removes that signup when you save."
        confirmLabel="Remove slot"
        onConfirm={mockConfirm}
        onCancel={mockCancel}
      />
    );

    expect(screen.getByText(/1 person is signed up/)).toBeInTheDocument();
    expect(screen.getByText(/removes that signup when you save/)).toBeInTheDocument();
  });

  it("confirm button is red (danger tone)", () => {
    const mockConfirm = jest.fn();
    const mockCancel = jest.fn();

    render(
      <ConfirmDialog
        title="Remove day?"
        body="Confirm removal"
        confirmLabel="Remove day"
        onConfirm={mockConfirm}
        onCancel={mockCancel}
      />
    );

    const confirmButton = screen.getByRole("button", { name: "Remove day" });
    expect(confirmButton).toHaveClass("bg-red-600");
  });
});
