import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node", testTimeout: 120_000, fileParallelism: false },
  // src/worker.ts loads in Node tests with base classes in place of the Workers runtime's.
  resolve: { alias: { "cloudflare:workers": new URL("./test/cloudflare-workers-stub.ts", import.meta.url).pathname } },
});
