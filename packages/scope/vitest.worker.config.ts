import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// The workerd run: the scope's Durable Object with real SQLite storage.
export default defineConfig({
  plugins: [cloudflareTest({ main: "./test/worker.ts", wrangler: { configPath: "./wrangler.test.jsonc" } })],
  test: {
    globalSetup: ["./test/support/local-clone-setup.ts"],
    include: ["test/**/*.test.ts"],
    exclude: ["test/operation-denial.test.ts"],
    // One isolate for every file: the Worker is loaded once. Each test founds its own scope, which is its own object and storage.
    isolate: false,
    maxWorkers: 1,
  },
});
