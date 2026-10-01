import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// workerd run: the Room Durable Object with real SQLite storage.
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./src/index.ts",
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: { ROOM_KEY_SECRET: "test-room-key-secret", LEASE_SECONDS: "1800", PUBLIC_URL: "https://artroom.test" },
      },
    }),
  ],
  test: {
    include: ["test/workerd/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
