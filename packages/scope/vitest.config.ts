import { defineConfig } from "vitest/config";

// Each witness runs once. The denial witness has a separate real Worker
// runtime because of the observed unsafe-abort interaction with later tests.
export default defineConfig({
  test: {
    projects: [
      { extends: "./vitest.worker.config.ts", test: { name: "scope", sequence: { groupOrder: 1 } } },
      { extends: "./vitest.denial.config.ts", test: { name: "scope-denial", sequence: { groupOrder: 2 } } },
    ],
  },
});
