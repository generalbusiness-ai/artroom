import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import { keyPairFromSeed } from "./src/crypto.ts";

/** The test operator key: its seed is fixed and known to the tests (test/workerd/support.ts). */
const operator = keyPairFromSeed(new Uint8Array(32).fill(0x0b)).key;

// The declared witness set (test/workerd/declared-run.test.ts): chosen tests of other files, run again under the
// code-review v2 declarations. It loads those files itself, so it runs alone, in its own isolate.
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
    include: ["test/workerd/declared-run.test.ts"],
    testTimeout: 60_000,
  },
});
