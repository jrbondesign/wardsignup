import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('should display homepage with correct content', async ({ page }) => {
    await page.goto('/');

    // Nav brand + hero headline (hero is not named "Ward Signup"; footer also links home)
    await expect(page.locator('nav').getByRole('link', { name: /Ward Signup/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Simple scheduling/i })).toBeVisible();

    await expect(page.getByText('Simple scheduling', { exact: false })).toBeVisible();

    // Primary CTA to create flow
    const createButton = page.getByRole('link', { name: 'Get Started' }).first();
    await expect(createButton).toBeVisible();
    await expect(createButton).toHaveAttribute('href', '/create');

    // Feature cards use styled divs, not heading roles
    await expect(page.getByText('Time Slots', { exact: true })).toBeVisible();
    await expect(page.getByText('Email Invites', { exact: true })).toBeVisible();
    await expect(page.getByText('Track Progress', { exact: true })).toBeVisible();
  });

  test('should navigate to create page when clicking Get Started', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: 'Get Started' }).first().click();

    // Should redirect to login (auth required)
    await expect(page).toHaveURL(/\/login/);
  });

  test('should have responsive design', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /Simple scheduling/i })).toBeVisible();

    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.getByRole('heading', { name: /Simple scheduling/i })).toBeVisible();
  });
});
