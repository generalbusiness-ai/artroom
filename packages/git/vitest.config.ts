import { defineConfig } from "vitest/config";

// These files run the `git` program against repositories in the system's temporary directory. Worker threads start faster than child processes.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node", pool: "threads" },
});
