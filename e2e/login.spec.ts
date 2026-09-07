import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should display login form', async ({ page }) => {
    // Check heading
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();

    // Check description
    await expect(
      page.getByText('Continue with Google or use a magic link below')
    ).toBeVisible();

    // Check email input
    const emailInput = page.getByPlaceholder('you@example.com');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('type', 'email');

    // Check submit button
    await expect(page.getByRole('button', { name: 'Send Magic Link' })).toBeVisible();

    // Google OAuth entry point (full flow requires real Supabase + Google)
    const googleBtn = page.getByRole('button', { name: 'Continue with Google' });
    await expect(googleBtn).toBeVisible();
    await expect(googleBtn).toBeEnabled();

    // Check back link
    await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible();
  });

  test.skip('should show error for empty email', async ({ page }) => {
    // TODO: Add form validation or update test
    // Currently the app validates on the client side via React state
  });

  test('should show error for invalid email format', async ({ page }) => {
    // Enter invalid email
    await page.getByPlaceholder('you@example.com').fill('notanemail');
    await page.getByRole('button', { name: 'Send Magic Link' }).click();

    // Should show HTML5 validation error
    const emailInput = page.getByPlaceholder('you@example.com');
    const validationMessage = await emailInput.evaluate((el: HTMLInputElement) => el.validationMessage);
    expect(validationMessage).toBeTruthy();
  });

  test('should navigate back to home', async ({ page }) => {
    await page.getByRole('link', { name: 'Back to home' }).click();
    await expect(page).toHaveURL('/');
  });

  test('should show loading state when submitting', async ({ page }) => {
    await page.getByPlaceholder('you@example.com').fill('test@example.com');

    const submitButton = page.getByRole('button', { name: 'Send Magic Link' });
    await submitButton.click();

    // Button should show loading state
    await expect(page.getByRole('button', { name: 'Sending...' })).toBeVisible();
  });

  test.skip('should show success message after sending magic link', async ({ page }) => {
    // This test requires Supabase auth configuration
    await page.getByPlaceholder('you@example.com').fill('test@example.com');
    await page.getByRole('button', { name: 'Send Magic Link' }).click();

    // Should show success screen
    await expect(page.getByRole('heading', { name: 'Check Your Email' })).toBeVisible();
    await expect(page.getByText(/We sent a magic link to/)).toBeVisible();
    await expect(page.getByText('test@example.com')).toBeVisible();
  });

  test('auth callback without tokens shows error UI with link back to login', async ({ page }) => {
    await page.goto('/auth/callback');
    await expect(page.getByRole('heading', { name: 'Authentication Error' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('link', { name: 'Try Again' })).toHaveAttribute('href', '/login');
  });

  test.skip('should allow user to try different email', async ({ page }) => {
    // This test requires Supabase auth configuration
    await page.getByPlaceholder('you@example.com').fill('test@example.com');
    await page.getByRole('button', { name: 'Send Magic Link' }).click();

    // Wait for success screen
    await expect(page.getByRole('heading', { name: 'Check Your Email' })).toBeVisible();

    // Click to use different email
    await page.getByRole('button', { name: 'Use a different email' }).click();

    // Should go back to login form
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByPlaceholder('you@example.com')).toHaveValue('');
  });
});
