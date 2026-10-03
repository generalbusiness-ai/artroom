import { defineConfig } from "vitest/config";

export default defineConfig({
  // One worker runs the files in turn and keeps its modules between them: no test file changes global state.
  test: { include: ["test/**/*.test.ts"], environment: "node", testTimeout: 120_000, fileParallelism: false, isolate: false },
  // src/worker.ts loads in Node tests with base classes in place of the Workers runtime's.
  resolve: { alias: { "cloudflare:workers": new URL("./test/cloudflare-workers-stub.ts", import.meta.url).pathname } },
});
