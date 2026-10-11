import { defineConfig } from "vitest/config";

// Resolve workspace sources at this checkout; third-party dependencies may be shared.
const source = (path: string): string => new URL(`../../packages/${path}`, import.meta.url).pathname;
export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  resolve: { alias: [
    { find: "@generalbusiness/artroom-derive/testing", replacement: source("derive/test/fixtures.ts") },
    { find: "@generalbusiness/artroom-derive/rule", replacement: source("derive/src/rule/index.ts") },
    { find: "@generalbusiness/artroom-derive", replacement: source("derive/src/index.ts") },
    { find: "@generalbusiness/artroom-bytes", replacement: source("bytes/src/index.ts") },
    { find: "@generalbusiness/artroom-contract", replacement: source("contract/src/index.ts") },
  ] },
  test: { include: ["definition.test.ts", "commitments.test.ts"], environment: "node", pool: "threads" },
});
