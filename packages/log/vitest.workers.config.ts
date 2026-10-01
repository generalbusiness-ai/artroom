import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// The same tests inside workerd, except those that run the git CLI.
export default defineConfig({
  plugins: [cloudflareTest({ miniflare: { compatibilityDate: "2026-08-15", compatibilityFlags: ["nodejs_compat"] } })],
  define: { __ARTROOM_RUNTIME__: JSON.stringify("workerd") },
  test: { include: ["test/**/*.test.ts"], exclude: ["test/**/*.node.test.ts"], testTimeout: 60_000 },
});
