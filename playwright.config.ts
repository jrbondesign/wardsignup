import { defineConfig, devices } from '@playwright/test';

/** When set (e.g. `https://ministrysignup.com`), run E2E against prod — no local dev server. */
const remoteBaseURL = process.env.PLAYWRIGHT_BASE_URL?.trim();

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: remoteBaseURL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  ...(remoteBaseURL
    ? {}
    : {
        webServer: {
          command: 'npm run dev',
          url: 'http://localhost:3000',
          // Prefer reusing a dev server on :3000 when present (avoids port conflicts locally).
          // In CI nothing listens yet, so Playwright still starts `npm run dev`.
          reuseExistingServer: process.env.PLAYWRIGHT_FORCE_FRESH_SERVER !== '1',
        },
      }),
});
