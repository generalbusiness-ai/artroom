import { defineConfig } from "vitest/config";

// The package has no test yet: its tests wait for the validator (I2 step 13).
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node", pool: "threads", passWithNoTests: true },
});
