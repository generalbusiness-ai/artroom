import { defineConfig } from "vitest/config";

// Node run: the pure parts (canonical bytes, keys and signatures, globs, secret scanning, schema).
export default defineConfig({
  test: {
    include: ["test/node/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
});
