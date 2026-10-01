import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// workerd run: the same test files, inside the Workers runtime.
export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2026-08-15",
        compatibilityFlags: ["nodejs_compat"],
      },
    }),
  ],
  define: { __ARTROOM_RUNTIME__: JSON.stringify("workerd") },
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
