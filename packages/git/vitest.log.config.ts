import { defineConfig } from "vitest/config";

// Lane L's log publisher over this package's pushLog, against real git (Node).
export default defineConfig({
  define: { __ARTROOM_RUNTIME__: JSON.stringify("node") },
  test: { include: ["test-log/**/*.test.ts"], environment: "node", testTimeout: 120_000 },
});
