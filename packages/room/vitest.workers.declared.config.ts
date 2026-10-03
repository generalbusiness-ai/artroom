import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import { keyPairFromSeed } from "./src/crypto.ts";

/** The test operator key: its seed is fixed and known to the tests (test/workerd/support.ts). */
const operator = keyPairFromSeed(new Uint8Array(32).fill(0x0b)).key;

/**
 * Tests the declared run does not run: each asserts that `artroom verify`
 * accepts the room's published log, and verify reads `v: 2` envelopes and
 * `v2` retained documents only from declared acts stage 3 (request
 * 1e8fee4b), which owns packages/log's decoding. They pass in the legacy
 * run. Matched by test title.
 */
export const NEEDS_STAGE_3_VERIFY = [
  "R-CARRY-13, R-LOG-10: artroom verify accepts a log with carried and not-carried events, replaying every decision",
  "never more than READ_LIMITS.entries entries per read; after the first publication only the last segment is read; a retained file is read only when new",
  "is staged in bounded parts and pushed with no objects; the whole cohort publishes to a verified log head",
  "an object larger than one transfer is staged in chunks of itself, and publishes",
  "a new claim, its notified event, and the first two publications, in the order of the worked example; both commits verify",
  "a session with roster acts, reviews, a check, a landing and a revocation publishes a log that verifies, with every decision replayed",
  "the production log remote, as the live services behave: the ref is read by the sandbox, objects through the binding of whatever type, each hashed; verifyLog runs over it",
] as const;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The declared run (docs/protocol.md section 33.6, request fd6f00b6): the
 * whole workerd suite against the code-review v2 declarations, with the
 * harness's four fixture-format conversions (test/workerd/vocabulary.ts),
 * less `NEEDS_STAGE_3_VERIFY`. Everything else is vitest.workers.config.ts's.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./src/index.ts",
      wrangler: { configPath: "./wrangler.test.jsonc" },
      miniflare: {
        bindings: {
          ROOM_KEY_SECRET: "test-room-key-secret",
          LEASE_SECONDS: "1800",
          PUBLIC_URL: "https://artroom.test",
          PUBLIC_NAMESPACE: "artroom-public",
          OPERATOR_KEYS: operator,
          ARTROOM_TEST_VOCABULARY: "code-review",
        },
      },
    }),
  ],
  test: {
    include: ["test/workerd/**/*.test.ts"],
    testTimeout: 60_000,
    testNamePattern: new RegExp(`^(?!.*(?:${NEEDS_STAGE_3_VERIFY.map(escape).join("|")})$)`),
  },
});
