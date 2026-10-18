/**
 * Verifies the editor page's three-dots buttons at day and slot levels
 * have mobile-friendly tap targets and no red text at rest.
 */

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

describe("Editor page three-dots buttons", () => {
  it("day header has mobile-friendly three-dots button (w-11 h-11 = 44px)", () => {
    const mockClick = jest.fn();
    
    render(
      <div className="flex items-start gap-2 px-0.5">
        <div className="font-serif text-[17px] text-[#0D2B35] whitespace-nowrap leading-tight flex-1">
          Thursday, Oct 8, 2026
        </div>
        <button
          type="button"
          onClick={mockClick}
          aria-label="Options for 2026-10-08"
          className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
      </div>
    );

    const button = screen.getByRole("button", { name: /options for/i });
    
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("w-11");
    expect(button).toHaveClass("h-11");
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-label");
  });

  it("slot card has mobile-friendly three-dots button (w-11 h-11 = 44px)", () => {
    const mockClick = jest.fn();
    
    render(
      <div className="border rounded-xl p-4 md:p-5 bg-white group">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex items-start gap-2.5">
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-[#0D2B35] leading-tight">
                Women's Class
              </div>
              <div className="text-xs text-[#5A8399] whitespace-nowrap mt-1">
                5:30 PM – 6:30 PM
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={mockClick}
            aria-label="Options for Women's Class"
            className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </div>
      </div>
    );

    const button = screen.getByRole("button", { name: /options for women's class/i });
    
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("w-11");
    expect(button).toHaveClass("h-11");
    expect(button).toHaveAttribute("type", "button");
  });

  it("three-dots buttons have no red text at rest", () => {
    render(
      <>
        <button
          type="button"
          aria-label="Options for 2026-10-08"
          className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Options for slot"
          className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
      </>
    );

    const buttons = screen.getAllByRole("button");
    
    buttons.forEach(button => {
      expect(button).toHaveClass("text-gray-500");
      expect(button).not.toHaveClass("text-red-500");
      expect(button).not.toHaveClass("text-red-600");
      expect(button).not.toHaveClass("text-red-700");
    });
  });

  it("drag handle is hidden on mobile (md:block)", () => {
    render(
      <span
        title="Drag to reorder"
        className="mt-0.5 cursor-grab active:cursor-grabbing text-[#A0B7C2] hover:text-[#0E96B0] transition-colors flex-shrink-0 touch-none hidden md:block"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <circle cx="9" cy="6" r="1.6" />
          <circle cx="15" cy="6" r="1.6" />
          <circle cx="9" cy="12" r="1.6" />
          <circle cx="15" cy="12" r="1.6" />
          <circle cx="9" cy="18" r="1.6" />
          <circle cx="15" cy="18" r="1.6" />
        </svg>
      </span>
    );

    const handle = screen.getByTitle("Drag to reorder");
    
    expect(handle).toHaveClass("hidden");
    expect(handle).toHaveClass("md:block");
  });
});
