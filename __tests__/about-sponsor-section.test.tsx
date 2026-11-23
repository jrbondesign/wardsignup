/**
 * Tests for the About page sponsor section and page order (Dana's About
 * page mockup v1 with Jonathan's changes).
 */

import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { readFileSync } from "fs";
import path from "path";
import AboutSponsorSection from "@/components/AboutSponsorSection";

const ACLG_HREF = "https://www.consumerwarrior.com/";
const LSA_HREF = "https://localsenioradvisor.com/";
const INTRO =
  "These sponsors help cover the cost of running Ward Signup. Sponsors get no data from Ward Signup and have no say in how the site works. Sponsorship is not an endorsement by The Church of Jesus Christ of Latter-day Saints.";
const ACLG_BODY =
  "Arizona Consumer Law Group and its managing attorney, John Skiba, are Ward Signup's first sponsor. Their support helps keep Ward Signup free for every ward.";
const LSA_BODY =
  "Local Senior Advisor and Randy Chipman help cover the cost of running Ward Signup. Randy is a Certified Senior Advisor with more than 12 years of experience helping Utah families find the right senior living community.";

describe("AboutSponsorSection", () => {
  it("renders one shared heading and the approved transparency line", () => {
    render(<AboutSponsorSection />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Thank you to our sponsors" })
    ).toBeInTheDocument();
    expect(screen.getByText(INTRO)).toBeInTheDocument();
  });

  it("keeps the ACLG block copy, logo, and links as is", () => {
    render(<AboutSponsorSection />);
    const card = screen.getByRole("article", { name: "Arizona Consumer Law Group" });
    expect(within(card).getByText(ACLG_BODY)).toBeInTheDocument();
    const logo = within(card).getByAltText("Arizona Consumer Law Group logo");
    expect(logo.closest("a")).toHaveAttribute("href", ACLG_HREF);
    const visit = within(card).getByRole("link", { name: "Visit Arizona Consumer Law Group" });
    expect(visit).toHaveAttribute("href", ACLG_HREF);
    expect(visit).toHaveAttribute("target", "_blank");
    expect(visit).toHaveAttribute("rel", "sponsored noopener");
  });

  it("keeps the dark plate behind the cream ACLG mark", () => {
    render(<AboutSponsorSection />);
    expect(screen.getByAltText("Arizona Consumer Law Group logo").className).toContain(
      "bg-[#0D2B35]"
    );
  });

  it("renders the approved LSA blurb, logo, and links", () => {
    render(<AboutSponsorSection />);
    const card = screen.getByRole("article", { name: "Local Senior Advisor" });
    expect(within(card).getByText(LSA_BODY)).toBeInTheDocument();
    const logo = within(card).getByAltText("Local Senior Advisor logo");
    const chip = logo.closest("a");
    expect(chip).toHaveAttribute("href", LSA_HREF);
    expect(chip).toHaveAttribute("rel", "sponsored noopener");
    const visit = within(card).getByRole("link", { name: "Visit Local Senior Advisor" });
    expect(visit).toHaveAttribute("href", LSA_HREF);
    expect(visit).toHaveAttribute("target", "_blank");
    expect(visit).toHaveAttribute("rel", "sponsored noopener");
  });

  it("lists ACLG first, then LSA", () => {
    render(<AboutSponsorSection />);
    const cards = screen.getAllByRole("article");
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual([
      "Arizona Consumer Law Group",
      "Local Senior Advisor",
    ]);
  });

  it("shows no dollar amount, no unit wording, and no owner claim", () => {
    const { container } = render(<AboutSponsorSection />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\$\d/);
    expect(text).not.toMatch(/\bunits?\b/i);
    expect(text).not.toMatch(/\bowner\b/i);
    expect(text).not.toMatch(/nonprofit/i);
  });
});

describe("About page order and copy", () => {
  const src = readFileSync(path.join(process.cwd(), "app/about/page.tsx"), "utf8");
  const article = src.slice(src.indexOf("<article"));

  it("leads with the product and puts sponsors last, after reach us and Explore", () => {
    const order = [
      "<h1",
      "What Ward Signup is",
      "Independent of the Church",
      "Who built it",
      "For members",
      "Pricing",
      "Where &amp; how to reach us",
      "Explore",
      "<AboutSponsorSection",
    ].map((needle) => {
      const idx = article.indexOf(needle);
      expect(idx).toBeGreaterThan(-1);
      return idx;
    });
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("keeps both emails", () => {
    expect(article).toContain("mailto:jonathan@wardsignup.com");
    expect(article).toContain("mailto:${brand.supportEmail}");
  });

  it("uses Ward Signup as two words in the page body and schema name", () => {
    expect(article).not.toContain("WardSignup");
    expect(article).toContain("About Ward Signup");
    expect(article).toContain('"name": "Ward Signup"');
  });

  it("uses the approved Who built it and For members copy", () => {
    expect(article).toContain("a product builder in Arizona");
    expect(article).toContain(
      "By default, names on a sheet are visible to the organizer and any co-admins in that ward organization, not to other people who open the link."
    );
    expect(article).toContain('href="/privacy"');
    expect(article).toContain('href="/ad-free"');
    expect(article).not.toMatch(/nonprofit/i);
  });
});
