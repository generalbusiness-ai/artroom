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
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: { ROOM_KEY_SECRET: "test-room-key-secret", LEASE_SECONDS: "1800", PUBLIC_URL: "https://artroom.test", PUBLIC_NAMESPACE: "artroom-public", OPERATOR_KEYS: operator },
      },
    }),
  ],
  test: {
    include: ["test/workerd/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
