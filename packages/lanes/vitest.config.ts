import { defineConfig } from "vitest/config";

// Plain function tests: the two definitions against the real validator, and against their pins.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node", pool: "threads" },
});
