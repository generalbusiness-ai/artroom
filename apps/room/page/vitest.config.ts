import { defineConfig } from "vitest/config";

// The Node tests: the states of a change, from views made by hand. The story on real scopes, `*.scope.test.ts`, runs from the root
// `vitest.config.ts` inside the scope project's Workers runtime pool.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], exclude: ["test/**/*.scope.test.ts"], environment: "node", pool: "threads" },
});
