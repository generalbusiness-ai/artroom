import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// The package's code is the same in Node and in workerd, and the Room's workerd tests publish and
// verify through it. So workerd runs only the file whose subject is the second runtime: the golden
// log published, retried, restarted and verified with policy replay, and the pinned commit IDs that
// both runtimes must reach (test/golden.test.ts). Every other test runs in Node alone.
export default defineConfig({
  plugins: [cloudflareTest({ miniflare: { compatibilityDate: "2026-08-15", compatibilityFlags: ["nodejs_compat"] } })],
  define: { __ARTROOM_RUNTIME__: JSON.stringify("workerd") },
  test: { include: ["test/golden.test.ts"], testTimeout: 60_000 },
});
