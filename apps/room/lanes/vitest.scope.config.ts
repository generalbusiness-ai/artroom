import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// The workerd run: the two lane definitions on real scopes, each a Durable Object with real SQLite storage, in one namespace.
export default defineConfig({
  plugins: [cloudflareTest({ main: "./test/support/worker.ts", wrangler: { configPath: "./wrangler.test.jsonc" } })],
  test: {
    include: ["test/**/*.scope.test.ts"],
    // One isolate for every file: the Worker is loaded once. Each test founds its own scopes, each its own object and storage.
    isolate: false,
    maxWorkers: 1,
  },
});
