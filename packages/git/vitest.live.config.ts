import { defineConfig } from "vitest/config";

// Live: lane L's log through the deployed artroom-lb-git (measure/log.live.test.ts). Needs LB_LIVE=1.
export default defineConfig({
  define: { __ARTROOM_RUNTIME__: JSON.stringify("node") },
  test: { include: ["measure/**/*.live.test.ts"], environment: "node", testTimeout: 600_000, hookTimeout: 300_000 },
});
