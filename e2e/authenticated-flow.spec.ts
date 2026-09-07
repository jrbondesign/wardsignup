import { test, expect } from '@playwright/test';

/*
 * These tests require proper authentication setup.
 * To run these tests, you need to:
 * 1. Configure Supabase auth in your project
 * 2. Set up Playwright auth state persistence
 * 3. Create a test user or use auth mocking
 */

test.describe('Authenticated User Flow', () => {
  // Mock auth state for testing
  // In production, you would login once and reuse the state
  test.beforeEach(async ({ page }) => {
    // TODO: Set authenticated state
    // Option 1: Use saved auth state file
    // Option 2: Mock Supabase auth in browser context
    // Option 3: Actually login (slower but more realistic)

    // For now, tests are skipped until auth is configured
  });

  test.skip('should redirect to login when accessing create page unauthenticated', async ({ page }) => {
    // Clear any auth state
    await page.context().clearCookies();

    await page.goto('/create');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test.skip('should show dashboard after authentication', async ({ page }) => {
    // With auth mocked/set up
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'My Events' })).toBeVisible();
    await expect(page.getByText(/Signed in as/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
    await expect(page.getByRole('link', { name: '+ Create New Event' })).toBeVisible();
  });

  test.skip('should create a new event', async ({ page }) => {
    await page.goto('/create');

    // Fill in event name
    await page.getByLabel('Event Name').fill('Test Event - E2E');

    // Submit
    await page.getByRole('button', { name: 'Create Event' }).click();

    // Should redirect to setup page
    await expect(page).toHaveURL(/\/setup\/.+/);
    await expect(page.getByRole('heading', { name: 'Set Up Teaching Sessions' })).toBeVisible();
  });

  test.skip('should set up sessions for new event', async ({ page }) => {
    // Assuming we're on setup page from previous test
    await page.goto('/setup/test-event-id'); // Replace with actual ID

    // Verify default session
    await expect(page.getByText('Session 1')).toBeVisible();

    // Update first session
    await page.locator('select').first().selectOption('2'); // Tuesday
    await page.locator('input[type="time"]').first().fill('19:00');
    await page.locator('input[type="number"]').first().fill('2');
    await page.getByPlaceholder('e.g., Detention Center').fill('Test Location');

    // Add another session
    await page.getByRole('button', { name: '+ Add Another Session' }).click();
    await expect(page.getByText('Session 2')).toBeVisible();

    // Configure second session
    await page.locator('select').nth(1).selectOption('4'); // Thursday
    await page.locator('input[type="time"]').nth(1).fill('15:00');
    await page.locator('input[type="number"]').nth(1).fill('1');

    // Save
    await page.getByRole('button', { name: 'Save & Continue' }).click();

    // Should redirect to admin dashboard
    await expect(page).toHaveURL(/\/admin\/.+/);
  });

  test.skip('should display admin dashboard with event details', async ({ page }) => {
    await page.goto('/admin/test-event-id');

    // Check event name
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Check stats cards
    await expect(page.getByText('Total spots')).toBeVisible();
    await expect(page.getByText('Signed Up')).toBeVisible();
    await expect(page.getByText('Remaining')).toBeVisible();

    // Check shareable link
    await expect(page.getByText('Shareable Signup Link')).toBeVisible();
    const linkInput = page.locator('input[readonly]');
    await expect(linkInput).toHaveValue(/\/event\/.+/);

    // Check copy button
    await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
  });

  test.skip('should copy shareable link to clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/admin/test-event-id');

    // Get the link value
    const linkInput = page.locator('input[readonly]');
    const linkValue = await linkInput.inputValue();

    // Click copy
    await page.getByRole('button', { name: 'Copy' }).click();

    // Verify clipboard content (in real browser with permissions)
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(linkValue);
  });

  test.skip('should show signups in admin dashboard', async ({ page }) => {
    await page.goto('/admin/test-event-id'); // Event with signups

    // Should show session with signups
    await expect(page.getByText(/filled/)).toBeVisible();

    // Should show signup details
    await expect(page.locator('.bg-gray-50').filter({ hasText: /@/ })).toBeVisible();
  });

  test.skip('should remove a session from setup', async ({ page }) => {
    await page.goto('/setup/test-event-id');

    // Add a second session
    await page.getByRole('button', { name: '+ Add Another Session' }).click();
    await expect(page.getByText('Session 2')).toBeVisible();

    // Remove it
    await page.getByRole('button', { name: 'Remove' }).first().click();

    // Should only have one session
    await expect(page.getByText('Session 2')).not.toBeVisible();
  });

  test.skip('should sign out successfully', async ({ page }) => {
    await page.goto('/dashboard');

    await page.getByRole('button', { name: 'Sign Out' }).click();

    // Should redirect to home
    await expect(page).toHaveURL('/');

    // Trying to access dashboard should redirect to login
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test.skip('should prevent unauthorized access to other users events', async ({ page }) => {
    // Try to access another user's event
    await page.goto('/admin/another-users-event-id');

    // Should redirect to dashboard or show error
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test.skip('should navigate between dashboard and create event', async ({ page }) => {
    await page.goto('/dashboard');

    // Click create event
    await page.getByRole('link', { name: '+ Create New Event' }).click();
    await expect(page).toHaveURL('/create');

    // Go back to dashboard
    await page.getByRole('link', { name: 'Back to My Events' }).click();
    await expect(page).toHaveURL('/dashboard');
  });
});
