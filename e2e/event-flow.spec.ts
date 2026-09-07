import { test, expect } from '@playwright/test';

/*
 * NOTE: These tests are outdated and need to be updated for the new authentication flow.
 * The app now uses email magic link authentication instead of PIN-based auth.
 * To run these tests, you'll need to set up Playwright auth mocking for Supabase.
 */

test.describe.serial('Complete Event Flow', () => {
  let eventId: string;
  let shareableLink: string;

  test.skip('should create an event and setup sessions', async ({ page }) => {
    // Navigate to home page
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Ward Signup' })).toBeVisible();

    // Click create event (requires authentication)
    await page.getByRole('link', { name: 'Create New Event' }).click();
    await expect(page).toHaveURL(/\/create/);

    // Fill in event name
    await page.getByPlaceholder(/e.g., Detention Center Teaching/).fill('Test Event - March 2026');

    // Submit form
    await page.getByRole('button', { name: 'Create Event' }).click();

    // Should redirect to setup page (no PIN in URL anymore)
    await expect(page).toHaveURL(/\/setup\/.+/);

    // Extract event ID from URL
    const url = new URL(page.url());
    eventId = url.pathname.split('/')[2];

    expect(eventId).toBeTruthy();
  });

  test.skip('should add teaching sessions', async ({ page }) => {
    // OUTDATED: This test uses PIN-based auth which has been removed
    // TODO: Update to use Supabase magic link authentication
    await page.goto(`/setup/${eventId}`);

    // Verify default session is present
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
    const session2Selects = page.locator('select').nth(1);
    await session2Selects.selectOption('4'); // Thursday

    const session2Times = page.locator('input[type="time"]').nth(1);
    await session2Times.fill('15:00');

    const session2Capacity = page.locator('input[type="number"]').nth(1);
    await session2Capacity.fill('1');

    // Save and continue
    await page.getByRole('button', { name: 'Save & Continue' }).click();

    // Should redirect to admin dashboard
    await expect(page).toHaveURL(/\/admin\/.+\?pin=\d{6}/);
  });

  test.skip('should display admin dashboard with sessions', async ({ page }) => {
    // OUTDATED: This test uses PIN-based auth which has been removed
    // TODO: Update to use Supabase magic link authentication
    await page.goto(`/admin/${eventId}`);

    // Verify campaign name
    await expect(page.getByRole('heading', { name: 'Test Campaign - March 2026' })).toBeVisible();

    // Verify stats
    await expect(page.getByText('Total spots')).toBeVisible();
    const totalCapacityCard = page.locator('.bg-blue-50');
    await expect(totalCapacityCard.getByText('3')).toBeVisible(); // 2 + 1 capacity

    // Verify sessions are displayed
    await expect(page.getByText('Tuesday')).toBeVisible();
    await expect(page.getByText('19:00 - Test Location')).toBeVisible();
    await expect(page.getByText('Thursday')).toBeVisible();
    await expect(page.getByText('15:00')).toBeVisible();

    // Get shareable link
    const linkInput = page.locator('input[readonly]');
    shareableLink = await linkInput.inputValue();
    expect(shareableLink).toContain(`/campaign/${campaignId}`);
  });

  test.skip('should allow member to view and sign up for sessions', async ({ page }) => {
    // OUTDATED: This test uses PIN-based auth which has been removed
    // TODO: Update to use Supabase magic link authentication
    // Navigate to member signup page
    await page.goto(shareableLink);

    // Verify campaign name
    await expect(page.getByRole('heading', { name: 'Test Campaign - March 2026' })).toBeVisible();

    // Verify sessions are visible
    await expect(page.getByText('Tuesday')).toBeVisible();
    await expect(page.getByText('0/2 filled')).toBeVisible();

    // Click on Tuesday session
    await page.getByText('19:00 - Test Location').click();

    // Verify signup form appears
    await expect(page.getByRole('heading', { name: 'Sign Up for This Session' })).toBeVisible();

    // Fill in member info
    await page.getByPlaceholder('John Doe').fill('John Smith');
    await page.getByPlaceholder('john@example.com').fill('john@test.com');
    await page.getByPlaceholder('(555) 123-4567').fill('555-1234');

    // Submit signup
    await page.getByRole('button', { name: 'Confirm Sign Up' }).click();

    // Should see success message
    await expect(page.getByText('Successfully signed up! Thank you for volunteering.')).toBeVisible();

    // Session should show updated capacity
    await expect(page.getByText('1/2 filled')).toBeVisible();
  });

  test.skip('should show signup in admin dashboard', async ({ page }) => {
    // OUTDATED: This test uses PIN-based auth which has been removed
    // TODO: Update to use Supabase magic link authentication
    // Navigate to admin dashboard
    await page.goto(`/admin/${campaignId}?pin=${adminPin}`);

    // Verify updated stats
    await expect(page.getByText('Signed Up')).toBeVisible();
    const signedUpCard = page.locator('.bg-green-50');
    await expect(signedUpCard.getByText('1')).toBeVisible(); // 1 signup out of 3 total capacity

    // Verify signup details in Tuesday session
    await expect(page.getByText('John Smith')).toBeVisible();
    await expect(page.getByText('john@test.com')).toBeVisible();
    await expect(page.getByText('555-1234')).toBeVisible();
  });

  test('should display homepage correctly', async ({ page }) => {
    // Test that works without authentication
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Simple scheduling/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Get Started' }).first()).toBeVisible();
    await expect(page.getByText('Simple scheduling', { exact: false })).toBeVisible();
  });

  // These tests are skipped pending auth setup for Playwright
  test.skip('All other tests require authentication setup', async () => {
    // Tests that need to be implemented with proper auth mocking:
    // - Create event flow
    // - Add sessions
    // - View admin dashboard
    // - Public signup (this works but needs event created first)
    // - Full session prevention
  });
});
