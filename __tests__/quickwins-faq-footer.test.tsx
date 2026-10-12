import { render, screen } from "@testing-library/react";
import MadeWithFooter, { madeWithHref } from "@/components/MadeWithFooter";
import { faqMeta } from "@/lib/seo/faq-meta";

const DASHES = /[-\u2010-\u2015]/;

describe("FAQ meta", () => {
  const { title, description } = faqMeta({ shortName: "Ward Signup" });
  it("fits SERP lengths", () => {
    expect(title.length).toBeGreaterThanOrEqual(50);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(description.length).toBeGreaterThanOrEqual(140);
    expect(description.length).toBeLessThanOrEqual(155);
  });
  it("has no dashes", () => {
    expect(title).not.toMatch(DASHES);
    expect(description).not.toMatch(DASHES);
  });
});

describe("MadeWithFooter", () => {
  it("links home with UTM tags", () => {
    expect(madeWithHref("https://wardsignup.com")).toBe(
      "https://wardsignup.com/?utm_source=signup_sheet&utm_medium=footer&utm_campaign=made_with"
    );
  });
  it("renders dash free copy", () => {
    render(<MadeWithFooter brandName="Ward Signup" siteUrl="https://wardsignup.com" />);
    expect(screen.getByTestId("made-with-footer")).toHaveTextContent(
      "Made with WardSignup.Create your own signup sheet for FREE."
    );
    expect(screen.getByTestId("made-with-footer").querySelector("br")).not.toBeNull();
    expect(screen.getByTestId("made-with-footer").textContent).not.toMatch(DASHES);
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent("Create your own signup sheet for FREE");
    expect(link.textContent).not.toMatch(DASHES);
    expect(link.getAttribute("href")).toContain("utm_campaign=made_with");
  });
});

describe("event page footer", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "../app/event/[id]/page.tsx"), "utf8");
  it("replaces the share line with the Made with line", () => {
    expect(src).not.toContain("Know someone who could use this?");
    expect((src.match(/<MadeWithFooter/g) || []).length).toBe(1);
  });
});
