import { expect, test } from "@playwright/test";
import fs from "fs";
import path from "path";

const widths = [320, 375, 390, 1280];
const outDir = path.join(process.cwd(), "qa-artifacts", "founder-metrics");

test.beforeAll(() => {
  fs.mkdirSync(outDir, { recursive: true });
});

test("founder metrics stay inside the viewport and wide tables scroll in the card", async ({ page }) => {
  await page.route("**/api/geography/public", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        cities: [{ city: "Example City", country: "US", latitude: 33.45, longitude: -112.07, userCount: 2 }],
        totalCities: 1,
        totalUsers: 2,
        refreshedAt: "2026-11-01T00:00:00.000Z",
      }),
    }),
  );

  const report: Record<string, unknown>[] = [];

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/demo/founder-metrics");
    await expect(page.getByRole("heading", { name: "Founder metrics" })).toBeVisible();
    await expect(page.getByText("ada@example.com")).toBeHidden();
    await page.getByText("Advanced diagnostics").click();
    await expect(page.getByText("ada@example.com")).toBeVisible();
    await expect(page.getByText("Maple Ridge Ward")).toBeVisible();

    const measure = await page.evaluate(() => {
      const doc = document.documentElement;
      const scrolls = [...document.querySelectorAll<HTMLElement>("[data-testid='metrics-hscroll']")].map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          which: el.getAttribute("data-metrics-scroll"),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          right: rect.right,
          left: rect.left,
        };
      });
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        scrolls,
      };
    });

    expect(measure.scrollWidth, `document overflow at ${width}px`).toBeLessThanOrEqual(measure.clientWidth);
    for (const scroll of measure.scrolls) {
      expect(scroll.right, `scrollport past the viewport at ${width}px`).toBeLessThanOrEqual(measure.clientWidth + 1);
      expect(scroll.left).toBeGreaterThanOrEqual(-1);
    }

    const creators = page.locator("[data-metrics-scroll='creators']");
    const creatorsCard = creators.locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    const creatorsBox = measure.scrolls.find((s) => s.which === "creators");
    expect(creatorsBox).toBeTruthy();
    if (width <= 390) {
      expect(creatorsBox!.scrollWidth).toBeGreaterThan(creatorsBox!.clientWidth);
      for (const name of ["Ward/Unit", "Organization"]) {
        const header = page.getByRole("columnheader", { name });
        await header.evaluate((el) => el.scrollIntoView({ inline: "center", block: "nearest" }));
        const inside = await header.evaluate((el) => {
          const port = el.closest("[data-metrics-scroll='creators']") as HTMLElement;
          const a = el.getBoundingClientRect();
          const b = port.getBoundingClientRect();
          return {
            headerLeft: a.left,
            headerRight: a.right,
            portLeft: b.left,
            portRight: b.right,
            viewport: document.documentElement.clientWidth,
            scrollLeft: port.scrollLeft,
          };
        });
        expect(inside.scrollLeft, `${name} did not scroll inside the card at ${width}px`).toBeGreaterThan(0);
        expect(inside.headerLeft, `${name} left of the card at ${width}px`).toBeGreaterThanOrEqual(inside.portLeft - 1);
        expect(inside.headerRight, `${name} right of the card at ${width}px`).toBeLessThanOrEqual(inside.portRight + 1);
        expect(inside.headerRight, `${name} past the viewport at ${width}px`).toBeLessThanOrEqual(inside.viewport + 1);
        await creatorsCard.screenshot({ path: path.join(outDir, `creators-${width}-${name.replace("/", "")}.png`) });
      }
      await creators.evaluate((el) => {
        el.scrollLeft = 0;
      });
    }

    await page.screenshot({ path: path.join(outDir, `founder-metrics-${width}.png`), fullPage: true });
    await creatorsCard.screenshot({ path: path.join(outDir, `creators-${width}.png`) });
    report.push({ width, ...measure });
  }

  fs.writeFileSync(path.join(outDir, "measurements.json"), JSON.stringify(report, null, 2));
});
