import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, test } from "vitest";

// Invariant: the module that the scope Worker serves at /page/ (`packages/scope/src/page-assets.ts`) is exactly what the page's
// build makes from its source now, so the deployed page is never older than this checkout. `npm run build` in this package writes
// it again; this test only compares.
test("the scope Worker's page module is the page's build of this source: run npm run build --workspace @generalbusiness/artroom-page when this fails", async () => {
  const script = "../scripts/assets.mjs";
  const { pageAssets, MODULE } = (await import(script)) as { pageAssets(): Promise<string>; MODULE: string };
  const actual = await readFile(MODULE, "utf8"), expected = await pageAssets();
  const summaryOf = (text: string) => `${Buffer.byteLength(text, "utf8")} UTF-8 bytes, sha256 ${createHash("sha256").update(text, "utf8").digest("hex")}`;
  expect(actual === expected, `Page module differs: actual ${summaryOf(actual)}; expected ${summaryOf(expected)}. Run npm run build --workspace @generalbusiness/artroom-page.`).toBe(true);
}, 60_000);
