import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { countingAssets, MODULE, type CountingAssetName } from "../../../examples/counting/scripts/assets.mjs";

// The existing Page Node project owns this browser-build freshness witness.
// One in-memory production build compares its exact three public assets with the committed Worker module;
// no files are generated here, and this proves no enrollment, browser execution or audio.
test("the Counting Worker module contains exactly the three current public production assets, with no fake preview", async () => {
  const actual = await readFile(MODULE, "utf8"), expected = await countingAssets();
  const summary = (text: string) => `${Buffer.byteLength(text, "utf8")} UTF-8 bytes, sha256 ${createHash("sha256").update(text, "utf8").digest("hex")}`;
  expect(actual === expected, `Counting module differs: actual ${summary(actual)}; expected ${summary(expected)}. Run node examples/counting/scripts/assets.mjs.`).toBe(true);
  // Parse only the generator's literal JSON export; do not evaluate generated source.
  const literal = /^export const COUNTING_ASSETS = (.+) as const;$/m.exec(expected);
  expect(literal, "The production generator must emit its literal asset map").not.toBeNull();
  const assets = JSON.parse(literal![1]!) as Record<CountingAssetName, { type: string; body: string }>;
  const names: CountingAssetName[] = ["counting.css", "counting.js", "index.html"];
  expect(Object.keys(assets).sort()).toEqual(names);
  expect(names.map(name => [name, assets[name].type])).toEqual([["counting.css", "text/css; charset=utf-8"], ["counting.js", "text/javascript; charset=utf-8"], ["index.html", "text/html; charset=utf-8"]]);
  expect(assets["index.html"].body).toContain('<script type="module" src="./counting.js"></script>');
  expect(assets["index.html"].body).toContain('<link rel="stylesheet" href="./counting.css">');
  expect(assets["index.html"].body).not.toMatch(/preview\.(?:ts|html)|\.\/main\.ts/);
  for (const body of Object.values(assets).map(asset => asset.body)) {
    expect(body).not.toMatch(/counting-fake\.test|fake-u1|FAKE session only|STATIC-(?:REQUEST|HEADER|COOKIE|URL)-SENTINEL/);
  }
}, 60_000);
