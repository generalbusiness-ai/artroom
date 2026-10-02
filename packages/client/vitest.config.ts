import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/workerd/**"],
    environment: "node",
    testTimeout: 30_000,
  },
});
