import { defineConfig } from "vitest/config";

// The runner's test runs the `git` program against repositories in the system's temporary directory, as the git package's tests do.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node", pool: "threads" },
});
