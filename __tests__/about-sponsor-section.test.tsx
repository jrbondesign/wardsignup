/**
 * Tests for the About page first sponsor section.
 */

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { readFileSync } from "fs";
import path from "path";
import AboutSponsorSection from "@/components/AboutSponsorSection";

const SPONSOR_HREF = "https://www.consumerwarrior.com/";
const BODY =
  "Arizona Consumer Law Group and its managing attorney, John Skiba, are WardSignup's first sponsor. Their support helps keep WardSignup free for every ward.";

describe("AboutSponsorSection", () => {
  it("renders the thank you heading, body, logo, and visit link", () => {
    render(<AboutSponsorSection />);

    expect(screen.getByText("Thank you to our first sponsor")).toBeInTheDocument();
    expect(screen.getByText(BODY)).toBeInTheDocument();
    expect(
      screen.getByAltText("Arizona Consumer Law Group logo")
    ).toBeInTheDocument();

    const visit = screen.getByRole("link", {
      name: "Visit Arizona Consumer Law Group",
    });
    expect(visit).toHaveAttribute("href", SPONSOR_HREF);
    expect(visit).toHaveAttribute("target", "_blank");
    expect(visit).toHaveAttribute("rel", "sponsored noopener");
  });

  it("makes the logo a sponsored link to the firm site", () => {
    render(<AboutSponsorSection />);

    const logo = screen.getByAltText("Arizona Consumer Law Group logo");
    const logoLink = logo.closest("a");
    expect(logoLink).toHaveAttribute("href", SPONSOR_HREF);
    expect(logoLink).toHaveAttribute("target", "_blank");
    expect(logoLink).toHaveAttribute("rel", "sponsored noopener");
  });

  it("does not show a dollar amount", () => {
    const { container } = render(<AboutSponsorSection />);
    expect(container.textContent).not.toMatch(/\$\d/);
  });
});

describe("About page placement", () => {
  it("places the sponsor section first in the About page content", () => {
    const src = readFileSync(
      path.join(process.cwd(), "app/about/page.tsx"),
      "utf8"
    );
    expect(src).toContain("import AboutSponsorSection from \"@/components/AboutSponsorSection\"");
    const article = src.slice(src.indexOf("<article"));
    const sponsorIdx = article.indexOf("<AboutSponsorSection");
    const h1Idx = article.indexOf("<h1");
    expect(sponsorIdx).toBeGreaterThan(-1);
    expect(h1Idx).toBeGreaterThan(-1);
    expect(sponsorIdx).toBeLessThan(h1Idx);
  });
});
