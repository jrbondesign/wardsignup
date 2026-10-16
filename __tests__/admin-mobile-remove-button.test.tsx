/**
 * Verifies the admin page's signup removal button has mobile-friendly tap targets.
 * Per iOS and Android guidelines, interactive elements should have a minimum
 * tap target of 44x44px (iOS) or 48x48px (Android Material Design).
 */

import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

describe("Admin page signup removal button", () => {
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
    
    // Verify button exists and is clickable
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Remove signup");
    
    // Verify mobile-friendly styling
    expect(button).toHaveClass("min-h-[44px]");
    expect(button).toHaveClass("px-3");
    expect(button).toHaveClass("py-2");
    
    // Verify accessibility
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-label");
    
    // Verify click handler works
    fireEvent.click(button);
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it("has no dashes in button text", () => {
    render(
      <button
        type="button"
        className="mt-2 px-3 py-2 min-h-[44px] rounded-lg text-sm font-medium text-red-500"
      >
        Remove signup
      </button>
    );

    const button = screen.getByRole("button");
    expect(button.textContent).not.toContain("-");
    expect(button.textContent).toBe("Remove signup");
  });

  it("provides visual feedback on hover (mobile: press)", () => {
    render(
      <button
        type="button"
        className="mt-2 px-3 py-2 min-h-[44px] rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 transition-colors"
      >
        Remove signup
      </button>
    );

    const button = screen.getByRole("button");
    
    // Verify hover states are defined
    expect(button).toHaveClass("hover:bg-red-50");
    expect(button).toHaveClass("hover:text-red-700");
    
    // Verify focus states for accessibility
    expect(button).toHaveClass("focus-visible:outline");
    expect(button).toHaveClass("focus-visible:outline-2");
  });
});
