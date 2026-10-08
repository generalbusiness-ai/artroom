import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

// Invariant: the module that the scope Worker serves at /page/ (`packages/scope/src/page-assets.ts`) is exactly what the page's
// build makes from its source now, so the deployed page is never older than this checkout. `npm run build` in this package writes
// it again; this test only compares.
test("the scope Worker's page module is the page's build of this source: run npm run build --workspace @generalbusiness/artroom-page when this fails", async () => {
  const script = "../scripts/assets.mjs";
  const { pageAssets, MODULE } = (await import(script)) as { pageAssets(): Promise<string>; MODULE: string };
  expect(await readFile(MODULE, "utf8")).toBe(await pageAssets());
}, 60_000);
