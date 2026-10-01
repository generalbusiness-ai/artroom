import { defineConfig } from "vitest/config";

// Node run: the same test files as the workerd run.
export default defineConfig({
  define: { __ARTROOM_RUNTIME__: JSON.stringify("node") },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
  },
});
