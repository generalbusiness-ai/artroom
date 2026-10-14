// The invariant: a deploy script runs the wrangler that package-lock.json
// pins, so a deploy uses the version the tests ran with. A script that names
// `@latest` runs whatever the registry serves that day (review L14).
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("no deploy script names @latest", () => {
  const scripts = readdirSync(join(root, "packages")).flatMap((p) => {
    const dir = join("packages", p, "scripts");
    try {
      return readdirSync(join(root, dir)).filter((f) => /^deploy.*\.sh$/.test(f)).map((f) => join(dir, f));
    } catch {
      return []; // the package has no scripts directory
    }
  });
  assert.ok(scripts.length > 0, "found no deploy script");
  const faults = scripts.flatMap((s) => readFileSync(join(root, s), "utf8").split("\n").flatMap((line, i) => (line.includes("@latest") ? [`${s}:${i + 1}: ${line.trim()}`] : [])));
  assert.deepEqual(faults, []);
});
