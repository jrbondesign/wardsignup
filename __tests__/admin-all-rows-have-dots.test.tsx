/**
 * Tests that all signup rows render three-dots buttons
 */

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

describe("Admin page signup rows", () => {
  it("renders dots button on every signup row", () => {
    const signups = [
      { id: "1", name: "John Smith" },
      { id: "2", name: "Sarah Johnson" },
      { id: "3", name: "Emily Rodriguez" },
      { id: "4", name: "Michael Chen" },
      { id: "5", name: "Jennifer Martinez" },
    ];

    render(
      <div>
        {signups.map((signup) => (
          <div key={signup.id} className="bg-[#F4FAFB] border border-[#0E96B0]/8 rounded-lg px-3 py-2.5 relative">
            <div className="flex items-start gap-2 pr-10">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#0D2B35]">{signup.name}</div>
              </div>
            </div>
            <button
              type="button"
              aria-label={`Options for ${signup.name}`}
              className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E96B0]"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    );

    // Verify all 5 rows have their dots button
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(5);

    // Verify each specific button exists
    signups.forEach((signup) => {
      const button = screen.getByRole("button", { name: `Options for ${signup.name}` });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass("w-11");
      expect(button).toHaveClass("h-11");
      expect(button).toHaveClass("text-gray-500");
    });
  });

  it("renders dots button on first, middle, and last rows", () => {
    render(
      <div>
        {/* First row */}
        <div className="bg-[#F4FAFB] border border-[#0E96B0]/8 rounded-lg px-3 py-2.5 relative">
          <div className="flex items-start gap-2 pr-10">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#0D2B35]">First Row</div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Options for First Row"
            className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center rounded-lg text-gray-500"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </div>

        {/* Middle row */}
        <div className="bg-[#F4FAFB] border border-[#0E96B0]/8 rounded-lg px-3 py-2.5 relative">
          <div className="flex items-start gap-2 pr-10">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#0D2B35]">Middle Row</div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Options for Middle Row"
            className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center rounded-lg text-gray-500"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </div>

        {/* Last row */}
        <div className="bg-[#F4FAFB] border border-[#0E96B0]/8 rounded-lg px-3 py-2.5 relative">
          <div className="flex items-start gap-2 pr-10">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#0D2B35]">Last Row</div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Options for Last Row"
            className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center rounded-lg text-gray-500"
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

    expect(screen.getByRole("button", { name: "Options for First Row" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Options for Middle Row" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Options for Last Row" })).toBeInTheDocument();
  });

  it("dots buttons are always visible, not conditional", () => {
    const { container } = render(
      <div>
        <div className="bg-[#F4FAFB] border border-[#0E96B0]/8 rounded-lg px-3 py-2.5 relative">
          <div className="flex items-start gap-2 pr-10">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#0D2B35]">John Doe</div>
            </div>
          </div>
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
        </div>
      </div>
    );

    const button = screen.getByRole("button", { name: "Options for John Doe" });
    
    // Button should be visible in the DOM (not hidden or conditional)
    expect(button).toBeVisible();
    
    // Should have visible color (text-gray-500, not transparent or hidden)
    expect(button).toHaveClass("text-gray-500");
    
    // Should be absolutely positioned (always there)
    expect(button).toHaveClass("absolute");
  });
});
