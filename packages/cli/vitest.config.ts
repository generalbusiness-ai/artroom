import { defineConfig } from "vitest/config";

// The Node tests: the files on disk and the command line. The story on real scopes, `*.scope.test.ts`, runs from the root
// `vitest.config.ts` inside the scope project's Workers runtime pool.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], exclude: ["test/**/*.scope.test.ts"], environment: "node", pool: "threads" },
});
