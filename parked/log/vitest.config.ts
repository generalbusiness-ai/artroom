import { defineConfig } from "vitest/config";

// Worker threads start faster than child processes, and each of these files is short: the pool
// is most of what a file costs beyond its tests. No test here needs a process of its own.
export default defineConfig({
  define: { __ARTROOM_RUNTIME__: JSON.stringify("node") },
  test: { include: ["test/**/*.test.ts"], environment: "node", testTimeout: 60_000, pool: "threads" },
});
