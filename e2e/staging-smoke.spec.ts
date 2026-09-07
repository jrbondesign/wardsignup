import { test, expect } from "@playwright/test";

/**
 * Minimal checks that the deployed app serves core routes.
 * Point STAGING_URL at your preview or staging deployment.
 */
test.describe("Staging / deployed smoke", () => {
  test("homepage loads with hero heading", async ({ page }) => {
    const res = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(res?.ok(), `GET / should succeed, got ${res?.status()}`).toBeTruthy();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /Simple scheduling/i,
      { timeout: 20_000 }
    );
  });

  test("login page loads", async ({ page }) => {
    const res = await page.goto("/login", { waitUntil: "domcontentloaded" });
    expect(res?.ok(), `GET /login should succeed, got ${res?.status()}`).toBeTruthy();
    await expect(
      page.getByRole("heading", { name: "Sign In" })
    ).toBeVisible({ timeout: 20_000 });
  });

  test("create page requires auth (redirect to login)", async ({ page }) => {
    await page.goto("/create", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  });
});
