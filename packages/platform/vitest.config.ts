import { defineConfig } from "vitest/config";

// Plain function tests: the definitions against the real validator. Worker threads start faster than child processes.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node", pool: "threads" },
});
