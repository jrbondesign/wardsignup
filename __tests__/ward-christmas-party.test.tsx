import { render } from "@testing-library/react";
import { getEventTemplate } from "@/lib/event-template-data";
import { buildPreset } from "@/lib/event-presets";

jest.mock("next/headers", () => ({
  headers: async () => new Map([["host", "wardsignup.com"]]),
}));
jest.mock("@/components/MarketingNav", () => () => null);
jest.mock("@/components/MarketingFooter", () => () => null);

// Hyphen, en dash, em dash and friends. Proper name exception handled below.
const DASHES = /[-\u2010-\u2015]/;
const stripProperNames = (s: string) => s.replace(/Latter-day Saints/g, "");

const FOOD = [
  ["Soup (serves 10 to 20)", 40],
  ["Gluten free soup (serves 10 to 20)", 5],
  ["Rolls and butter (2 dozen)", 25],
  ["Dessert (2 dozen)", 25],
  ["Gluten free dessert (2 dozen)", 2],
];
const JOBS = [
  ["Setup crew", 6], ["Decorations", 4], ["Greeters", 2], ["Serving food", 6],
  ["Kids activity", 3], ["Nativity helpers", 4], ["Music", 2], ["Cleanup crew", 8],
];

describe("Ward Christmas Party template", () => {
  const t = getEventTemplate("ward-christmas-party")!;

  it("is a ward only Bring or Do template", () => {
    expect(t).toBeDefined();
    expect(t.catId).toBe("bring");
    expect(t.brands).toEqual(["wardsignup"]);
    expect(t.previewImage).toBe("/templates/ward-christmas-party.webp");
  });

  it("has the Food and Jobs items with counts, and no Santa", () => {
    const pick = (sec: string) => t.defaultItems!.filter((i) => i.section === sec).map((i) => [i.label, i.quantity]);
    expect(pick("Food")).toEqual(FOOD);
    expect(pick("Jobs")).toEqual(JOBS);
    expect(t.defaultItems!.some((i) => /santa/i.test(i.label))).toBe(false);
  });

  it("preset carries sections into the form and keeps names hidden by default", () => {
    const { patch } = buildPreset("ward-christmas-party");
    expect(patch.eventType).toBe("items");
    expect(patch.items![0]).toEqual({ label: "Soup (serves 10 to 20)", itemLimit: 40, section: "Food" });
    expect(patch.items!.filter((i) => i.section === "Jobs")).toHaveLength(8);
    expect(patch).not.toHaveProperty("showSignupsPublicly", true);
  });

  it("template copy has no dashes, ampersands or 'unit'", () => {
    const copy = [t.label, t.desc, t.defaultName, t.defaultDescription, ...t.defaultItems!.map((i) => i.label)].join("\n");
    expect(copy).not.toMatch(DASHES);
    expect(copy).not.toMatch(/&/);
    expect(copy).not.toMatch(/\bunits?\b/i);
  });
});

describe("/use-cases/ward-christmas-party", () => {
  it("is in the sitemap", async () => {
    const sitemap = (await import("@/app/sitemap")).default;
    const urls = (await sitemap()).map((e: { url: string }) => e.url);
    expect(urls).toContain("https://wardsignup.com/use-cases/ward-christmas-party");
  });

  it("has canonical, OG image and title", async () => {
    const { generateMetadata } = await import("@/app/use-cases/ward-christmas-party/page");
    const m = await generateMetadata();
    expect(m.alternates?.canonical).toBe("/use-cases/ward-christmas-party");
    expect(JSON.stringify(m.openGraph)).toContain("/templates/ward-christmas-party-og.jpg");
    expect(String(m.title)).not.toMatch(DASHES);
    expect(String(m.description)).not.toMatch(DASHES);
  });

  it("renders dash free, 'unit' free copy, FAQ JSON-LD and template CTAs", async () => {
    const Page = (await import("@/app/use-cases/ward-christmas-party/page")).default;
    const { container } = render(await Page());
    const text = container.textContent ?? "";
    expect(stripProperNames(text)).not.toMatch(DASHES);
    expect(text).not.toMatch(/\bunits?\b/i);
    expect(text).toContain("Nativity helpers");
    const ctas = Array.from(container.querySelectorAll("a")).filter((a) => a.textContent === "Use this template");
    expect(ctas.length).toBeGreaterThanOrEqual(2);
    ctas.forEach((a) => expect(a.getAttribute("href")).toBe("/create?template=ward-christmas-party"));
    const ld = Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map((s) => JSON.parse(s.innerHTML));
    const faq = ld.find((j) => j["@type"] === "FAQPage");
    expect(faq.mainEntity.length).toBe(6);
    expect(stripProperNames(JSON.stringify(ld))).not.toMatch(/[\u2013\u2014]| - /);
    expect(JSON.stringify(faq)).toContain("branch, ward or stake");
  });

  it("is linked from the use cases index, footer and llms.txt", () => {
    const fs = require("fs"), path = require("path");
    const read = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
    for (const f of ["app/use-cases/page.tsx", "components/MarketingFooter.tsx", "components/HomePage.tsx", "public/llms.txt"]) {
      expect(read(f)).toContain("/use-cases/ward-christmas-party");
    }
  });
});
