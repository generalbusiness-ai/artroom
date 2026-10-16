import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

// Invariant: the Worker embeds exactly the current allowlisted public brand bytes.
test("the Worker's public brand module matches its reviewed source files", async () => {
  const { brandAssets, MODULE } = await import("../../../../scripts/brand-assets.mjs") as { brandAssets(): Promise<string>; MODULE: string };
  expect(await readFile(MODULE, "utf8")).toBe(await brandAssets());
});
