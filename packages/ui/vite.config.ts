import { defineConfig } from "vitest/config";

// Preact through the automatic JSX runtime; no Babel, no plugin.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
  build: { target: "es2022", outDir: "dist", sourcemap: true },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.{ts,tsx}"],
    // The files share two worker threads, and with them one browser environment and one copy of the page's modules
    // per thread. Setting those up again for every file cost more than the tests. Each test file cleans up the
    // page and the address after each test, and restores what it spied on.
    pool: "threads",
    isolate: false,
    maxWorkers: 2,
  },
});
