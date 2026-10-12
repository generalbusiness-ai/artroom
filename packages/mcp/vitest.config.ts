import { defineConfig } from "vitest/config";

// The Node tests: derivation, errors, budgets of the list, custody on files, and the two wire revisions over stdio and loopback
// HTTP. The stories on real scopes, `*.scope.test.ts`, run from the root `vitest.config.ts` inside the scope project's Workers
// runtime pool.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], exclude: ["test/**/*.scope.test.ts"], environment: "node", pool: "threads", testTimeout: 60_000 },
});
