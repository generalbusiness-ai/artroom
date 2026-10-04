import { defineConfig, devices } from "@playwright/test";

// Headless Chromium against the production build, served by `vite preview`.
// The clock and locale are fixed so screenshots are reproducible.
export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    timezoneId: "UTC",
    locale: "en-GB",
    trace: "off",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "npx vite build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
