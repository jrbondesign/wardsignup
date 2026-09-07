import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests against a deployed URL (preview or production).
 * Usage:
 *   STAGING_URL=https://wardsignup.com npm run staging:smoke
 *
 * Note: Vercel **Deployment Protection** returns 401 on *.vercel.app URLs unless
 * you disable protection or pass credentials (not configured here).
 */
const baseURL =
  process.env.STAGING_URL?.replace(/\/$/, "") ||
  process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/staging-smoke.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
