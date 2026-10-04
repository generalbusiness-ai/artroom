import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import { keyPairFromSeed } from "./src/crypto.ts";

/** The test operator key: its seed is fixed and known to the tests (test/workerd/support.ts). */
const operator = keyPairFromSeed(new Uint8Array(32).fill(0x0b)).key;

// workerd run: the Room Durable Object with real SQLite storage.
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./src/index.ts",
      wrangler: { configPath: "./wrangler.test.jsonc" },
      miniflare: {
        bindings: { ROOM_KEY_SECRET: "test-room-key-secret", LEASE_SECONDS: "1800", PUBLIC_URL: "https://artroom.test", PUBLIC_NAMESPACE: "artroom-public", OPERATOR_KEYS: operator },
      },
    }),
  ],
  test: {
    include: ["test/workerd/**/*.test.ts"],
    // The declared witness set loads other test files a second time under another vocabulary, so it needs an isolate
    // of its own: vitest.declared.config.ts runs it.
    exclude: ["test/workerd/declared-run.test.ts"],
    testTimeout: 60_000,
    // The files share isolates: loading the Worker is paid once per worker, not once per file. Every room has its
    // own Durable Object and its own storage, and no test depends on another file's rooms.
    isolate: false,
    maxWorkers: 4,
  },
});
