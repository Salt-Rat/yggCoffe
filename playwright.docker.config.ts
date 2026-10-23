import { defineConfig } from "@playwright/test";
import config from "./playwright.config";
export default defineConfig({
  ...config,
  metadata: { dockerProduction: true },
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/browser-summary.json" }],
  ],
  use: {
    ...config.use,
    baseURL: process.env.E2E_BASE_URL || "http://localhost:18080",
  },
  webServer: undefined,
});
