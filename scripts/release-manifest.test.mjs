// The invariant: each of the six released packages can be built and packed as
// its manifest claims. One shared nonzero version; exact dependencies between
// them; a CLI with no runtime dependency; and every export and bin naming a
// source file that the build turns into the file the tarball's manifest names.
// It reads manifests only. The real pack and install is scripts/check-release.mjs.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PACKAGES, builtFrom, manifestFaults, packageDir, readManifest } from "./release-lib.mjs";

test("the six package manifests are ready to release", () => {
  assert.deepEqual(manifestFaults(), []);
});

test("every export and bin names a file that exists, and the build covers each source file", () => {
  for (const short of PACKAGES) {
    const dir = packageDir(short);
    const manifest = readManifest(short);
    const targets = [...Object.values(manifest.exports ?? {}), ...Object.values(manifest.bin ?? {})];
    assert.ok(targets.length > 0, `${manifest.name} exports nothing`);
    const sources = targets.map(builtFrom).filter(Boolean);
    for (const target of targets) assert.ok(existsSync(join(dir, target)), `${manifest.name}: ${target} does not exist`);
    if (sources.length === 0) continue;
    // The build config must put src/x.ts at dist/x.js, with declarations, and must not leave a source target out.
    const build = JSON.parse(readFileSync(join(dir, "tsconfig.build.json"), "utf8"));
    const { rootDir, outDir, noEmit, declaration, rewriteRelativeImportExtensions } = build.compilerOptions;
    assert.deepEqual({ rootDir, outDir, noEmit, declaration, rewriteRelativeImportExtensions }, { rootDir: "src", outDir: "dist", noEmit: false, declaration: true, rewriteRelativeImportExtensions: true }, manifest.name);
    assert.deepEqual(build.include, ["src"], manifest.name);
    for (const { source } of sources) assert.ok(!(build.exclude ?? []).includes(source.slice(2)), `${manifest.name}: the build leaves out ${source}`);
    assert.equal(manifest.scripts.build, "tsc -p tsconfig.build.json", manifest.name);
  }
});
