import { test, expect } from "@playwright/test";

test.describe("Auth middleware", () => {
  test("unauthenticated visit to /dashboard redirects to login with next=", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?/);
    await expect(page).toHaveURL(/next=/);
    await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
  });

  test("unauthenticated visit to /create redirects to login", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/create");
    await expect(page).toHaveURL(/\/login\?/);
  });

  test("public /login loads without redirect loop", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
  });

  test("public home page loads", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/");
    await expect(page).toHaveURL("/");
  });
});
