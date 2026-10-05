import { defineConfig } from "vitest/config";

// Worker threads start faster than child processes, and these files are short.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node", pool: "threads" },
});
