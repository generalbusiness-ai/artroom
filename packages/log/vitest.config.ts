import { defineConfig } from "vitest/config";

export default defineConfig({
  define: { __ARTROOM_RUNTIME__: JSON.stringify("node") },
  test: { include: ["test/**/*.test.ts"], environment: "node", testTimeout: 60_000 },
});
