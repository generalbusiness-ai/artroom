import { defineConfig } from "vitest/config";

// Node run: every test file. The workerd run repeats the three that depend on the runtime.
export default defineConfig({
  define: { __ARTROOM_RUNTIME__: JSON.stringify("node") },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // The files share two worker threads and their loaded modules: the suite is plain logic over JSON, and loading
    // the engine once per file cost more than the tests. test/faults.test.ts, the one file that replaces a module,
    // loads its own copies and unloads them again.
    pool: "threads",
    isolate: false,
    maxWorkers: 2,
    testTimeout: 60_000,
  },
});
