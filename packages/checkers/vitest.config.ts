import { defineConfig } from "vitest/config";

export default defineConfig({
  // One worker runs the files in turn and keeps its modules between them: no test file changes global state.
  // The whole run takes about 3 seconds, so a test that waits 20 has hung.
  test: { include: ["test/**/*.test.ts"], environment: "node", testTimeout: 20_000, fileParallelism: false, isolate: false },
  // src/worker.ts loads in Node tests with base classes in place of the Workers runtime's.
  resolve: { alias: { "cloudflare:workers": new URL("./test/cloudflare-workers-stub.ts", import.meta.url).pathname } },
});
