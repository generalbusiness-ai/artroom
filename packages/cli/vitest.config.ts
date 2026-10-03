import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    // One process, and one copy of the modules for each worker thread. No test file changes a module's state without
    // putting it back (the harness sets the git runner for a file and restores it after).
    pool: "threads",
    isolate: false,
  },
});
