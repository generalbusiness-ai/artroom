import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    // One process and three worker threads, each with one copy of the modules. No test file changes a module's state
    // without putting it back: the harness sets the git runner for a file and restores it after.
    pool: "threads",
    isolate: false,
    maxWorkers: 3,
  },
});
