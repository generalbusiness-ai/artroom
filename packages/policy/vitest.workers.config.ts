import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// workerd run: the tests of what depends on the runtime, inside the Workers runtime. These are the evaluator's
// conformance corpus and bounds, the pinned engine and digests, and the measured budgets, which must give the same
// numbers as the Node run. The rest of the package is plain logic over JSON and runs in Node only.
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
    include: ["test/profile-corpus.test.ts", "test/integrity.test.ts", "test/budgets.test.ts"],
    testTimeout: 60_000,
  },
});
