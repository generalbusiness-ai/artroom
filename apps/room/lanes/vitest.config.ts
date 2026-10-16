import { defineConfig } from "vitest/config";

// Plain function tests: the two definitions against the real validator, and against their pins. The scenarios on real scopes
// are `*.scope.test.ts`, which `vitest.scope.config.ts` runs in the Workers runtime.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], exclude: ["test/**/*.scope.test.ts"], environment: "node", pool: "threads" },
});
