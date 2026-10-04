import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/workerd/**"],
    environment: "node",
    // The files share two worker threads and their loaded modules. Every test makes its own fake room on its own
    // port and stops it, so the files share nothing else.
    pool: "threads",
    isolate: false,
    maxWorkers: 2,
    testTimeout: 30_000,
  },
});
