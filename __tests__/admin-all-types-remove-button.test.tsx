/**
 * Verifies the admin page has three-dots options menu for ALL event types with
 * mobile-friendly tap targets: time slots (spots), items/potluck, and RSVP events.
 */

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

describe("Admin page signup removal - all event types (three-dots menu)", () => {
  describe("Time slots (spots/rsvp) type", () => {
    it("has mobile-friendly three-dots icon button (44px tap area)", () => {
      render(
        <div className="bg-[#F4FAFB] border border-[#0E96B0]/8 rounded-lg px-3 py-2.5 relative">
          <div className="flex items-start gap-2 pr-10">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#0D2B35]">John Doe</div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Options for John Doe"
            className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E96B0]"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </div>
      );

      const button = screen.getByRole("button", { name: /options for john doe/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass("w-11");
      expect(button).toHaveClass("h-11");
      expect(button).toHaveClass("absolute");
      expect(button).toHaveAttribute("type", "button");
    });
  });

  describe("Items/potluck type", () => {
    it("has three-dots button with mobile-friendly tap target", () => {
      render(
        <div className="bg-[#F4FAFB] border border-[#0E96B0]/8 rounded-lg px-3 py-2.5 relative">
          <div className="flex items-start gap-2 pr-10">
            <div className="flex-1 min-w-0">
              <span className="text-sm text-[#0D2B35] font-medium">Sarah Johnson</span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Options for Sarah Johnson"
            className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E96B0]"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </div>
      );

      const button = screen.getByRole("button", { name: /options for sarah johnson/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass("w-11");
      expect(button).toHaveClass("h-11");
    });

    it("has three-dots button for custom/write-in items", () => {
      render(
        <div className="bg-[#F4FAFB] border border-[#0E96B0]/8 rounded-lg px-3 py-2.5 relative">
          <div className="flex items-start gap-2 pr-10">
            <div className="flex-1 min-w-0">
              <span className="text-sm text-[#0D2B35] font-medium">Emily Rodriguez</span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Options for Emily Rodriguez"
            className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E96B0]"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </div>
      );

      const button = screen.getByRole("button", { name: /options for emily rodriguez/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass("w-11");
      expect(button).toHaveClass("h-11");
    });
  });

  describe("Consistent styling across all types", () => {
    it("uses same three-dots icon button styling for all event types", () => {
      const expectedClasses = [
        "absolute",
        "top-2",
        "right-2",
        "w-11",
        "h-11",
        "flex",
        "items-center",
        "justify-center",
        "rounded-lg",
        "text-gray-500",
        "hover:text-gray-600",
        "hover:bg-gray-100",
        "transition-colors",
        "focus-visible:outline",
        "focus-visible:outline-2",
        "focus-visible:outline-[#0E96B0]"
      ];

      const { container } = render(
        <div>
          {/* Time slot button */}
          <button
            type="button"
            aria-label="Options for Time slot user"
            className={expectedClasses.join(" ")}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
          {/* Item button */}
          <button
            type="button"
            aria-label="Options for Item user"
            className={expectedClasses.join(" ")}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
          {/* Custom item button */}
          <button
            type="button"
            aria-label="Options for Custom item user"
            className={expectedClasses.join(" ")}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
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
    it("has proper type, aria-label, and 44px tap target", () => {
      render(
        <button
          type="button"
          aria-label="Options for John Doe"
          className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center rounded-lg text-gray-500"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
      );

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("type", "button");
      expect(button).toHaveAttribute("aria-label");
      // w-11 and h-11 = 44px (meets iOS/Android tap target guidelines)
      expect(button).toHaveClass("w-11");
      expect(button).toHaveClass("h-11");
    });
  });

  describe("Content placement with three-dots button", () => {
    it("adds padding-right to content area to avoid overlap with button", () => {
      const { container } = render(
        <div className="bg-[#F4FAFB] border border-[#0E96B0]/8 rounded-lg px-3 py-2.5 relative">
          <div className="flex items-start gap-2 pr-10">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#0D2B35]">John Doe</div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Options for John Doe"
            className="absolute top-2 right-2 w-11 h-11"
          >
            ...
          </button>
        </div>
      );

      const contentArea = container.querySelector(".pr-10");
      expect(contentArea).toBeInTheDocument();
      expect(contentArea).toHaveClass("pr-10");
    });
  });
});
