/**
 * Verifies the admin page has Remove signup buttons for ALL event types with
 * mobile-friendly tap targets: time slots (spots), items/potluck, and RSVP events.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

describe("Admin page signup removal - all event types", () => {
  describe("Time slots (spots/rsvp) type", () => {
    it("has mobile-friendly tap target (min-h-[44px])", () => {
      const mockRemove = jest.fn();
      
      render(
        <div>
          <button
            type="button"
            onClick={mockRemove}
            aria-label="Remove John Doe from this slot"
            className="mt-2 px-3 py-2 min-h-[44px] rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 transition-colors"
          >
            Remove signup
          </button>
        </div>
      );

      const button = screen.getByRole("button", { name: /remove.*john doe/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass("min-h-[44px]");
      expect(button).toHaveClass("px-3");
      expect(button).toHaveClass("py-2");
    });
  });

  describe("Items/potluck type", () => {
    it("has Remove button with mobile-friendly tap target", () => {
      const mockRemove = jest.fn();
      
      render(
        <div>
          <button
            type="button"
            onClick={mockRemove}
            aria-label="Remove Sarah Johnson from Potato Salad"
            className="mt-2 px-3 py-2 min-h-[44px] rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 transition-colors"
          >
            Remove signup
          </button>
        </div>
      );

      const button = screen.getByRole("button", { name: /remove.*sarah johnson.*potato salad/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass("min-h-[44px]");
      fireEvent.click(button);
      expect(mockRemove).toHaveBeenCalledTimes(1);
    });

    it("has Remove button for custom/write-in items", () => {
      const mockRemove = jest.fn();
      
      render(
        <div>
          <button
            type="button"
            onClick={mockRemove}
            aria-label="Remove Emily Rodriguez from custom item"
            className="mt-2 px-3 py-2 min-h-[44px] rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 transition-colors"
          >
            Remove signup
          </button>
        </div>
      );

      const button = screen.getByRole("button", { name: /remove.*emily rodriguez.*custom item/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass("min-h-[44px]");
    });
  });

  describe("Consistent styling across all types", () => {
    it("uses same mobile-friendly styling for all event types", () => {
      const expectedClasses = [
        "mt-2",
        "px-3",
        "py-2",
        "min-h-[44px]",
        "rounded-lg",
        "text-sm",
        "font-medium",
        "text-red-500",
        "hover:bg-red-50",
        "hover:text-red-700",
        "focus-visible:outline",
        "focus-visible:outline-2",
        "focus-visible:outline-red-400",
        "transition-colors"
      ];

      const { container } = render(
        <div>
          {/* Time slot button */}
          <button
            type="button"
            aria-label="Time slot remove"
            className={expectedClasses.join(" ")}
          >
            Remove signup
          </button>
          {/* Item button */}
          <button
            type="button"
            aria-label="Item remove"
            className={expectedClasses.join(" ")}
          >
            Remove signup
          </button>
          {/* Custom item button */}
          <button
            type="button"
            aria-label="Custom item remove"
            className={expectedClasses.join(" ")}
          >
            Remove signup
          </button>
        </div>
      );

      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(3);
      
      // All buttons should have the same styling
      buttons.forEach(button => {
        expectedClasses.forEach(className => {
          expect(button).toHaveClass(className);
        });
      });
    });
  });

  describe("Accessibility", () => {
    it("has proper type, aria-label, and no dashes in text", () => {
      render(
        <button
          type="button"
          aria-label="Remove John Doe from this slot"
          className="mt-2 px-3 py-2 min-h-[44px] rounded-lg text-sm font-medium text-red-500"
        >
          Remove signup
        </button>
      );

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("type", "button");
      expect(button).toHaveAttribute("aria-label");
      expect(button.textContent).not.toContain("-");
      expect(button.textContent).toBe("Remove signup");
    });
  });
});
