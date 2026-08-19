import { defineConfig } from "@playwright/test";

/**
 * OpsDesk role-based test config.
 *
 * Global setup boots a throwaway Flask server (fresh DB) on :5010 and tears
 * it down afterwards. Run from the repo root:
 *
 *   npx playwright test --config "Test Case/samples/playwright.config.ts"
 *
 * Filter by role project:  --project=admin  --project=requester  etc.
 */
const PORT = 5010;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: __dirname,
  testMatch: /\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: true,
  workers: 4,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "admin", testMatch: /admin\.spec\.ts/ },
    { name: "manager", testMatch: /manager\.spec\.ts/ },
    { name: "agent", testMatch: /agent\.spec\.ts/ },
    { name: "hragent", testMatch: /hragent\.spec\.ts/ },
    { name: "requester", testMatch: /requester\.spec\.ts/ },
  ],
  globalSetup: require.resolve("./global-setup"),
  globalTeardown: require.resolve("./global-setup"),
});