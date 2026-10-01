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
  },
});
