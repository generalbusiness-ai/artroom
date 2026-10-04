// The invariant: each of the six released packages can be built and packed as
// its manifest claims. One shared nonzero version; exact dependencies between
// them; a CLI with no runtime dependency; and every export and bin naming a
// source file that the build turns into the file the tarball's manifest names.
// It reads manifests only. The real pack and install is scripts/check-release.mjs.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PACKAGES, THIRD_PARTY_NOTICES, builtFrom, bundleFaults, bundledThirdParty, manifestFaults, packageDir, publishManifest, readManifest, root, thirdParty, thirdPartyFaults, thirdPartyNotices } from "./release-lib.mjs";

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

// The invariant: the CLI tarball carries the licence text of every package whose
// code its bundle contains. The recorded texts are checked by hash here. The
// real bundle is compared with the record when it is packed and checked.
test("the recorded third-party licence texts are intact and go into the CLI tarball only", () => {
  assert.deepEqual(thirdPartyFaults(), []);
  for (const short of PACKAGES) assert.equal(publishManifest(short).files.includes(THIRD_PARTY_NOTICES), short === "cli", short);
  const text = thirdPartyNotices("@generalbusiness/artroom-cli", readManifest("cli").version);
  for (const p of thirdParty()) {
    assert.ok(text.includes(`${p.name} ${p.version}\nDeclared licence: ${p.license}\n`), p.name);
    assert.ok(text.includes(p.text.toString("utf8").replace(/\r\n/g, "\n").trimEnd()), `${p.name}: licence text`);
  }
});

test("a bundle is compared with the record by what it contains: directly bundled and embedded packages", () => {
  const direct = thirdParty().filter((p) => !p.embeddedIn);
  // A bundle that names one module file of zod and nothing else.
  const zodOnly = "// ../../node_modules/zod/index.js\nvar x = 1;\n";
  assert.deepEqual(bundledThirdParty(zodOnly), [{ name: "zod", version: direct.find((p) => p.name === "zod").version }]);
  const missing = bundleFaults(zodOnly);
  assert.ok(missing.length === thirdParty().length - 1 && missing.every((f) => /which the bundle does not contain$/.test(f)), missing.join("\n"));
  // A file of the MCP server package whose own build embeds other packages brings them in.
  const server = "// ../../node_modules/@modelcontextprotocol/server/dist/index.mjs\n";
  assert.deepEqual(bundledThirdParty(server).map((p) => p.name), ["@modelcontextprotocol/server"]);
  const chunk = readdirSync(join(root, "node_modules/@modelcontextprotocol/server/dist")).find((n) => /^ajvProvider-.*\.mjs$/.test(n));
  const embedded = bundledThirdParty(`// ../../node_modules/@modelcontextprotocol/server/dist/${chunk}\n`);
  assert.deepEqual(embedded.filter((p) => p.embeddedIn).map((p) => `${p.name} ${p.version} in ${p.embeddedIn}`), thirdParty().filter((p) => p.embeddedIn && p.name !== "content-type").map((p) => `${p.name} ${p.version} in ${p.embeddedIn}`));
  // A package the record does not have is a fault, and a file that is not installed stops the check.
  assert.ok(bundleFaults("// ../../node_modules/esbuild/package.json\n").some((f) => /contains esbuild .* does not record$/.test(f)));
  assert.throws(() => bundledThirdParty("// ../../node_modules/zod/not-there.js\n"), /not installed/);
});
