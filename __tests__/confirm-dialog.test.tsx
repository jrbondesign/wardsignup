/**
 * Tests for ConfirmDialog component
 */

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import ConfirmDialog from "@/components/ConfirmDialog";

describe("ConfirmDialog", () => {
  const mockConfirm = jest.fn();
  const mockCancel = jest.fn();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("has aria-modal='true' attribute", () => {
    render(
      <ConfirmDialog
        title="Remove John Doe?"
        body="They will be taken off the slot. This cannot be undone."
        confirmLabel="Remove"
        onConfirm={mockConfirm}
        onCancel={mockCancel}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("has proper aria-labelledby and aria-describedby", () => {
    render(
      <ConfirmDialog
        title="Remove John Doe?"
        body="They will be taken off the slot. This cannot be undone."
        confirmLabel="Remove"
        onConfirm={mockConfirm}
        onCancel={mockCancel}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-labelledby", "dialog-title");
    expect(dialog).toHaveAttribute("aria-describedby", "dialog-body");

    expect(screen.getByText("Remove John Doe?")).toHaveAttribute("id", "dialog-title");
    expect(screen.getByText(/They will be taken off the slot/)).toHaveAttribute("id", "dialog-body");
  });

  it("renders title and body text", () => {
    render(
      <ConfirmDialog
        title="Remove John Doe?"
        body="They will be taken off the slot. This cannot be undone."
        confirmLabel="Remove"
        onConfirm={mockConfirm}
        onCancel={mockCancel}
      />
    );

    expect(screen.getByText("Remove John Doe?")).toBeInTheDocument();
    expect(screen.getByText(/They will be taken off the slot/)).toBeInTheDocument();
  });

  it("renders Cancel and Remove buttons", () => {
    render(
      <ConfirmDialog
        title="Remove John Doe?"
        body="They will be taken off the slot. This cannot be undone."
        confirmLabel="Remove"
        onConfirm={mockConfirm}
        onCancel={mockCancel}
      />
    );

    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });
});
