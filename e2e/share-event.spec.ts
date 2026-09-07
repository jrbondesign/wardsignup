import { test, expect } from '@playwright/test';

test.describe('Event Sharing', () => {
  test.skip('should open share modal from admin dashboard', async ({ page }) => {
    // This test requires authentication
    await page.goto('/admin/test-event-id');

    // Click share button
    await page.getByRole('button', { name: /Share & Invite/ }).click();

    // Modal should appear
    await expect(page.getByRole('heading', { name: 'Share Event' })).toBeVisible();
    await expect(page.getByText('Invite others to sign up for')).toBeVisible();
  });

  test.skip('should copy shareable link to clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/admin/test-event-id');

    // Open share modal
    await page.getByRole('button', { name: /Share & Invite/ }).click();

    // Get the link value
    const linkInput = page.locator('input[readonly]').first();
    const linkValue = await linkInput.inputValue();

    // Click copy button
    await page.getByRole('button', { name: /Copy/ }).click();

    // Verify clipboard content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(linkValue);

    // Button should show "Copied!" temporarily
    await expect(page.getByRole('button', { name: /Copied/ })).toBeVisible();
  });

  test.skip('should display social sharing options', async ({ page }) => {
    await page.goto('/admin/test-event-id');

    // Open share modal
    await page.getByRole('button', { name: /Share & Invite/ }).click();

    // Check for social share buttons
    await expect(page.getByRole('button', { name: /Email/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /WhatsApp/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /SMS/ })).toBeVisible();
  });

  test.skip('should validate email invitation form', async ({ page }) => {
    await page.goto('/admin/test-event-id');

    // Open share modal
    await page.getByRole('button', { name: /Share & Invite/ }).click();

    // Try to send invite without email
    await page.getByRole('button', { name: 'Send Invitation' }).click();

    // Should show validation error
    const emailInput = page.getByPlaceholder('member@example.com');
    const validationMessage = await emailInput.evaluate((el: HTMLInputElement) => el.validationMessage);
    expect(validationMessage).toBeTruthy();
  });

  test.skip('should send email invitation', async ({ page }) => {
    await page.goto('/admin/test-event-id');

    // Open share modal
    await page.getByRole('button', { name: /Share & Invite/ }).click();

    // Fill in invitation form
    await page.getByPlaceholder('member@example.com').fill('test@example.com');
    await page.getByPlaceholder('John Doe').fill('Test User');
    await page.getByPlaceholder('Add a personal message').fill('Please sign up!');

    // Send invitation
    await page.getByRole('button', { name: 'Send Invitation' }).click();

    // Should show success message
    await expect(page.getByText('Invitation sent successfully!')).toBeVisible();

    // Form should be cleared
    await expect(page.getByPlaceholder('member@example.com')).toHaveValue('');
  });

  test.skip('should close share modal', async ({ page }) => {
    await page.goto('/admin/test-event-id');

    // Open share modal
    await page.getByRole('button', { name: /Share & Invite/ }).click();
    await expect(page.getByRole('heading', { name: 'Share Event' })).toBeVisible();

    // Click close button
    await page.getByText('×').click();

    // Modal should disappear
    await expect(page.getByRole('heading', { name: 'Share Event' })).not.toBeVisible();
  });

  test.skip('should copy link from quick copy button on dashboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/admin/test-event-id');

    // Click the quick copy button (not in modal)
    await page.getByRole('button', { name: /Copy Link/ }).click();

    // Verify clipboard was updated
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toMatch(/\/event\/.+/);
  });

  test.skip('should open email client when clicking Email share', async ({ page, context }) => {
    await page.goto('/admin/test-event-id');

    // Open share modal
    await page.getByRole('button', { name: /Share & Invite/ }).click();

    // Listen for popup
    const popupPromise = page.waitForEvent('popup');

    // Click Email share button
    await page.getByRole('button', { name: /📧.*Email/ }).click();

    // Verify mailto link was opened
    const popup = await popupPromise;
    expect(popup.url()).toContain('mailto:');
    expect(popup.url()).toContain('subject=');
    expect(popup.url()).toContain('body=');
  });

  test.skip('should open WhatsApp when clicking WhatsApp share', async ({ page }) => {
    await page.goto('/admin/test-event-id');

    // Open share modal
    await page.getByRole('button', { name: /Share & Invite/ }).click();

    // Listen for popup
    const popupPromise = page.waitForEvent('popup');

    // Click WhatsApp share button
    await page.getByRole('button', { name: /💬.*WhatsApp/ }).click();

    // Verify WhatsApp link was opened
    const popup = await popupPromise;
    expect(popup.url()).toContain('wa.me');
  });
});
