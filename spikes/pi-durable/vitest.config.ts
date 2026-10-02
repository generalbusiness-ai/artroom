import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { keyPairFromSeed } from "./vendor/artroom/packages/room/src/crypto.ts";

const pkg = (p: string) => fileURLToPath(new URL(`./vendor/artroom/packages/${p}`, import.meta.url));

/** The test operator key, as lane A's workerd suite fixes it (vendor/.../room/test/workerd/support.ts). */
const operator = keyPairFromSeed(new Uint8Array(32).fill(0x0b)).key;

// workerd run: lane A's Room over fake remotes, and the spike's Agent, which
// hosts pi-durable on Durable Object SQLite. Run scripts/setup.sh first.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@generalbusiness\/artroom-contract$/, replacement: pkg("contract/src/index.ts") },
      { find: /^@generalbusiness\/artroom-contract\/policy$/, replacement: pkg("contract/src/policy.ts") },
      { find: /^@generalbusiness\/artroom-contract\/client$/, replacement: pkg("contract/src/transports.ts") },
      { find: /^@generalbusiness\/artroom-contract\/checker$/, replacement: pkg("contract/src/checker.ts") },
      { find: /^@generalbusiness\/artroom-git$/, replacement: pkg("git/src/index.ts") },
      { find: /^@generalbusiness\/artroom-git\/worker$/, replacement: pkg("git/src/worker.ts") },
      { find: /^@generalbusiness\/artroom-log$/, replacement: pkg("log/src/index.ts") },
      { find: /^@generalbusiness\/artroom-policy$/, replacement: pkg("policy/src/index.ts") },
      { find: /^@generalbusiness\/artroom-policy\/helpers$/, replacement: pkg("policy/src/helpers.ts") },
      { find: /^@generalbusiness\/artroom-policy\/pack$/, replacement: pkg("policy/src/pack.ts") },
      { find: /^@generalbusiness\/artroom-room$/, replacement: pkg("room/src/index.ts") },
      { find: /^@generalbusiness\/artroom-client$/, replacement: pkg("client/src/index.ts") },
    ],
  },
  plugins: [
    cloudflareTest({
      main: "./src/worker.ts",
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          ROOM_KEY_SECRET: "test-room-key-secret",
          OPERATOR_KEYS: operator,
          // Only for the live run: passed from the host environment, never written here (README, "Live run").
          ...(process.env["OPENROUTER_API_KEY"] ? { OPENROUTER_API_KEY: process.env["OPENROUTER_API_KEY"] } : {}),
          ...(process.env["SPIKE_LIVE_MODEL"] ? { SPIKE_LIVE_MODEL: process.env["SPIKE_LIVE_MODEL"] } : {}),
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
