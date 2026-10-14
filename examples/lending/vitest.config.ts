import { defineConfig } from "vitest/config";

// Resolve workspace sources at this checkout; third-party dependencies may be shared.
const source = (path: string): string => new URL(`../../packages/${path}`, import.meta.url).pathname;
export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  resolve: { alias: [
    { find: "@generalbusiness/dap-platform/membership-actions", replacement: source("platform/src/membership-actions.ts") },
    { find: "@generalbusiness/dap-platform", replacement: source("platform/src/index.ts") },
    { find: "@generalbusiness/dap-derive/testing", replacement: source("derive/test/fixtures.ts") },
    { find: "@generalbusiness/dap-derive/rule", replacement: source("derive/src/rule/index.ts") },
    { find: "@generalbusiness/dap-derive", replacement: source("derive/src/index.ts") },
    { find: "@generalbusiness/artroom-bytes", replacement: source("bytes/src/index.ts") },
    { find: "@generalbusiness/dap-contract", replacement: source("contract/src/index.ts") },
  ] },
  test: { include: ["definition.test.ts", "shelf.test.ts", "browser/model.test.ts", "browser/custody.test.ts", "browser/publication.test.ts"], environment: "node", pool: "threads" },
});
