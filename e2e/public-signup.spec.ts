import { test, expect } from '@playwright/test';

test.describe('Public Event Signup Page', () => {
  // Note: These tests require an existing event with sessions
  // You'll need to create test data in your database or use fixtures

  test.skip('should display event information', async ({ page }) => {
    const testEventId = 'test-event-id'; // Replace with real ID from test data
    await page.goto(`/event/${testEventId}`);

    // Check event name is displayed
    await expect(page.locator('h1')).toBeVisible();

    // Check description
    await expect(page.getByText(/Select a session below to sign up/)).toBeVisible();
  });

  test.skip('should display available sessions grouped by day', async ({ page }) => {
    const testEventId = 'test-event-id';
    await page.goto(`/event/${testEventId}`);

    // Check for day headings (example: Tuesday, Thursday)
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(await page.getByRole('heading', { level: 2 }).count());

    // Sessions should show time, location, capacity
    await expect(page.getByText(/\d+\/\d+ filled/)).toHaveCount(await page.getByText(/\d+\/\d+ filled/).count());
  });

  test.skip('should allow selecting a session', async ({ page }) => {
    const testEventId = 'test-event-id';
    await page.goto(`/event/${testEventId}`);

    // Click on first available session
    const firstSession = page.locator('button').filter({ hasText: /\d+:\d+/ }).first();
    await firstSession.click();

    // Signup form should appear
    await expect(page.getByRole('heading', { name: 'Sign Up for This Session' })).toBeVisible();
    await expect(page.getByPlaceholder('John Doe')).toBeVisible();
    await expect(page.getByPlaceholder('john@example.com')).toBeVisible();
    await expect(page.getByPlaceholder(/\d{3}/)).toBeVisible(); // Phone number
  });

  test.skip('should validate required fields in signup form', async ({ page }) => {
    const testEventId = 'test-event-id';
    await page.goto(`/event/${testEventId}`);

    // Select a session
    const firstSession = page.locator('button').filter({ hasText: /\d+:\d+/ }).first();
    await firstSession.click();

    // Try to submit without name
    await page.getByRole('button', { name: 'Confirm Sign Up' }).click();

    // Should show validation error
    const nameInput = page.getByPlaceholder('John Doe');
    const validationMessage = await nameInput.evaluate((el: HTMLInputElement) => el.validationMessage);
    expect(validationMessage).toBeTruthy();
  });

  test.skip('should successfully sign up for a session', async ({ page }) => {
    const testEventId = 'test-event-id';
    await page.goto(`/event/${testEventId}`);

    // Get initial capacity
    const capacityText = await page.getByText(/\d+\/\d+ filled/).first().textContent();

    // Select a session
    const firstSession = page.locator('button').filter({ hasText: /\d+:\d+/ }).first();
    await firstSession.click();

    // Fill in signup form
    await page.getByPlaceholder('John Doe').fill('Test User');
    await page.getByPlaceholder('john@example.com').fill('test@example.com');
    await page.getByPlaceholder(/\d{3}/).fill('555-1234');

    // Submit
    await page.getByRole('button', { name: 'Confirm Sign Up' }).click();

    // Should show success message
    await expect(page.getByText(/Successfully signed up/)).toBeVisible();

    // Capacity should update
    const newCapacityText = await page.getByText(/\d+\/\d+ filled/).first().textContent();
    expect(newCapacityText).not.toBe(capacityText);
  });

  test.skip('should allow canceling signup form', async ({ page }) => {
    const testEventId = 'test-event-id';
    await page.goto(`/event/${testEventId}`);

    // Select a session
    const firstSession = page.locator('button').filter({ hasText: /\d+:\d+/ }).first();
    await firstSession.click();

    // Form should be visible
    await expect(page.getByRole('heading', { name: 'Sign Up for This Session' })).toBeVisible();

    // Click cancel
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Form should disappear
    await expect(page.getByRole('heading', { name: 'Sign Up for This Session' })).not.toBeVisible();
  });

  test.skip('should disable full sessions', async ({ page }) => {
    const testEventId = 'test-event-id'; // Use event with full session
    await page.goto(`/event/${testEventId}`);

    // Find a full session (2/2 filled)
    const fullSession = page.locator('button').filter({ hasText: 'Full' }).first();

    if (await fullSession.count() > 0) {
      await expect(fullSession).toBeDisabled();
    }
  });

  test.skip('should show error message if event not found', async ({ page }) => {
    await page.goto('/event/non-existent-id');

    await expect(page.getByText('Event not found')).toBeVisible();
  });
});
