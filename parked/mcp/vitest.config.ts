import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    // One process and two worker threads, each with one copy of the modules. No test file changes a module's state.
    pool: "threads",
    isolate: false,
    maxWorkers: 2,
  },
});
