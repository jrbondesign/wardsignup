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
    await expect(page.getByText("ada@example.com", { exact: true })).toBeHidden();
    await page.getByText("Advanced diagnostics").click();
    await expect(page.getByText("ada@example.com", { exact: true })).toBeVisible();
    await expect(page.getByText("Maple Ridge Ward", { exact: true })).toBeVisible();

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
    const creatorsTable = page.locator("[data-metrics-scroll='creators'] table");
    await expect(creatorsTable.getByRole("columnheader")).toHaveText(["Email", "Ward/Unit", "Organization"]);
    await expect(page.getByText("very-long-example-organizer@example.com", { exact: true })).toBeVisible();

    if (width <= 390) {
      expect(creatorsBox!.scrollWidth, `creators should scroll inside the card at ${width}px`).toBeGreaterThan(creatorsBox!.clientWidth);
      const header = creatorsTable.getByRole("columnheader", { name: "Organization" });
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
      expect(inside.scrollLeft, `Organization did not scroll inside the card at ${width}px`).toBeGreaterThan(0);
      expect(inside.headerLeft).toBeGreaterThanOrEqual(inside.portLeft - 1);
      expect(inside.headerRight).toBeLessThanOrEqual(inside.portRight + 1);
      expect(inside.headerRight).toBeLessThanOrEqual(inside.viewport + 1);
      await creators.evaluate((el) => {
        el.scrollLeft = 0;
      });
    } else {
      expect(creatorsBox!.scrollWidth).toBeLessThanOrEqual(creatorsBox!.clientWidth + 1);
    }

    await creatorsCard.screenshot({ path: path.join(outDir, `creators-${width}.png`) });

    const details = page.getByRole("button", { name: "Details for ada@example.com" });
    await details.focus();
    await page.keyboard.press("Enter");
    await expect(details).toBeFocused();
    await expect(details).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("region", { name: "Details for ada@example.com" })).toBeVisible();
    await expect(page.getByTestId("creator-calling").filter({ hasText: "Bishop" })).toBeVisible();
    await expect(page.getByTestId("creator-events").filter({ hasText: "3" })).toBeVisible();
    await expect(page.getByTestId("creator-sessions").filter({ hasText: "12" })).toBeVisible();
    await expect(page.getByTestId("creator-signups").filter({ hasText: "7" })).toBeVisible();

    const longDetails = page.getByRole("button", { name: "Details for very-long-example-organizer@example.com" });
    await longDetails.focus();
    await page.keyboard.press("Enter");
    await expect(longDetails).toBeFocused();
    await expect(longDetails).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("A long example calling that should stay inside the card when details are open")).toBeVisible();

    const expanded = await page.evaluate(() => {
      const doc = document.documentElement;
      const port = document.querySelector<HTMLElement>("[data-metrics-scroll='creators']")!;
      const portBox = port.getBoundingClientRect();
      const panels = [...document.querySelectorAll<HTMLElement>("[data-testid='creator-details']")].map((panel) => {
        const box = panel.getBoundingClientRect();
        return { left: box.left, right: box.right };
      });
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        portRight: portBox.right,
        panels,
      };
    });
    expect(expanded.scrollWidth, `expanded document overflow at ${width}px`).toBeLessThanOrEqual(expanded.clientWidth);
    expect(expanded.portRight).toBeLessThanOrEqual(expanded.clientWidth + 1);
    expect(expanded.panels.length).toBe(2);
    for (const panel of expanded.panels) {
      expect(panel.left, `details left of the viewport at ${width}px`).toBeGreaterThanOrEqual(-1);
      expect(panel.right, `details past the viewport at ${width}px`).toBeLessThanOrEqual(expanded.clientWidth + 1);
    }

    await creatorsCard.screenshot({ path: path.join(outDir, `creators-${width}-expanded.png`) });
    await page.screenshot({ path: path.join(outDir, `founder-metrics-${width}-expanded.png`), fullPage: true });

    await details.focus();
    await page.keyboard.press("Enter");
    await expect(details).toBeFocused();
    await expect(details).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("region", { name: "Details for ada@example.com" })).toHaveCount(0);

    report.push({ width, compact: measure, expanded });
  }

  fs.writeFileSync(path.join(outDir, "measurements.json"), JSON.stringify(report, null, 2));
});
