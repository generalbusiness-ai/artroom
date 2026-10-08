import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Same Worker and real SQLite, one witness, no clone fixture/server setup.
export default defineConfig({
  plugins: [cloudflareTest({ main: "./test/worker.ts", wrangler: { configPath: "./wrangler.test.jsonc" } })],
  test: {
    include: ["test/operation-denial.test.ts"],
    isolate: false,
    maxWorkers: 1,
  },
});
