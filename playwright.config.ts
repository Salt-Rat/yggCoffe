import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const installedBrowser = join(
  homedir(),
  ".cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
);
const executablePath =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
  (existsSync(installedBrowser) ? installedBrowser : undefined);
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
});
