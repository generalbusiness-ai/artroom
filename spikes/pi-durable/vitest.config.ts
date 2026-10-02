import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { keyPairFromSeed } from "./vendor/artroom/packages/room/src/crypto.ts";
import { LIVE_PROVIDERS, liveModel, type LiveProvider } from "./src/live.ts";

const pkg = (p: string) => fileURLToPath(new URL(`./vendor/artroom/packages/${p}`, import.meta.url));

/** The test operator key, as lane A's workerd suite fixes it (vendor/.../room/test/workerd/support.ts). */
const operator = keyPairFromSeed(new Uint8Array(32).fill(0x0b)).key;

/** The live run, if SPIKE_LIVE asks for one (src/live.ts); it throws if a credential it needs is missing. */
const live = liveModel(process.env);
/** The host variables passed to workerd: the live switches, and only the selected provider's credentials. Never written here. */
const passed = live === undefined ? [] : ["SPIKE_LIVE", "SPIKE_LIVE_MODEL", ...LIVE_PROVIDERS[live.provider as LiveProvider].needs];

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
      // The AI binding is remote: connect it (with wrangler's login) only for a live run on it, so other runs need no Cloudflare account.
      remoteBindings: live?.provider === "workers-ai",
      miniflare: {
        bindings: {
          ROOM_KEY_SECRET: "test-room-key-secret",
          OPERATOR_KEYS: operator,
          // Only for the live run (README, "Live run").
          ...Object.fromEntries(passed.flatMap((k) => (process.env[k] ? [[k, process.env[k]]] : []))),
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
