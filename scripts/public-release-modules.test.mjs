// One coherent reproduction and closure/rewrite witness; no compiler/SDK loading.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PLAN, outputClosure, productionInputs, publishManifest, references, rewriteDeclarationRefs } from "./public-release-lib.mjs";

const root = new URL("../", import.meta.url);
test("SDK module references preserve genuine imports and rewrite declarations without treating capability data as modules", () => {
  const capability = readFileSync(new URL("packages/contract/src/capability.ts", root), "utf8");
  assert.deepEqual(references(capability), []); // Actual three quoted 'from' rows.
  const source = [
    `import "./side.ts";`,
    `import type { Value, from as named }`,
    `  from "./types.ts";`,
    `import * as bytes from "@generalbusiness/artroom-bytes";`,
    `export type * from './public.ts';`,
    `export { Value } from "./reexport.ts";`,
    `type Nested = import("./nested.ts").Value;`,
    `const later = import("./later.ts");`,
    `const data = ["export", "from", "import('./not-a-module.ts')"];`,
    `type Data = { from: "from './unchanged.ts'" };`,
    `const template = \`from './template-data.ts'\`;`,
    `const pattern = /from "regex-data.ts"/;`,
    `// export * from "./comment.ts";`,
  ].join("\n");
  const expected = ["./side.ts", "./types.ts", "@generalbusiness/artroom-bytes", "./public.ts", "./reexport.ts", "./nested.ts", "./later.ts"];
  assert.deepEqual(references(source), expected);
  assert.throws(() => references(`const computed = import(name);`), /unsupported-module-syntax/);
  const dir = mkdtempSync(join(tmpdir(), "artroom-sdk-module-witness-"));
  try {
    mkdirSync(join(dir, "dist"));
    const file = join(dir, "dist", "fixture.d.ts");
    writeFileSync(file, source);
    const changes = rewriteDeclarationRefs(dir);
    assert.equal(changes.length, 1);
    const rewritten = readFileSync(file, "utf8");
    assert.deepEqual(references(rewritten), expected.map(value => value.startsWith(".") ? value.slice(0, -3) + ".js" : value));
    for (const line of source.split("\n").slice(8)) assert.ok(rewritten.includes(line));
    assert.deepEqual(rewriteDeclarationRefs(dir), []);
    // The six-package amendment omits only the known source-only boundaries.
    const platform = PLAN.packages.find(spec => spec.dir === "platform");
    const replay = PLAN.packages.find(spec => spec.dir === "replay");
    const platformManifest = JSON.parse(readFileSync(new URL("packages/platform/package.json", root), "utf8"));
    const published = publishManifest(platform, platformManifest, "0.1.0-dev.2");
    assert.deepEqual(Object.keys(published.exports), ["."]);
    assert.throws(() => publishManifest(platform, { ...platformManifest, exports: { ...platformManifest.exports, "./private": "./src/private.ts" } }, "0.1.0-dev.2"), /unsupported-source-manifest/);
    assert.deepEqual(productionInputs(replay, ["packages/replay/src/index.ts", "packages/replay/src/bin.ts"]), { names: ["packages/replay/src/index.ts"], omitted: ["packages/replay/src/bin.ts"] });
    assert.throws(() => productionInputs({ ...replay, excludedInputs: ["src/index.ts"] }, ["packages/replay/src/index.ts", "packages/replay/src/bin.ts"]), /source-input-exclusions/);
    const stage = join(dir, "production"); mkdirSync(join(stage, "dist/src"), { recursive: true });
    writeFileSync(join(stage, "package.json"), JSON.stringify({ name: "@generalbusiness/artroom-replay", version: "0.1.0-dev.2", type: "module", exports: { ".": { types: "./dist/src/index.d.ts", default: "./dist/src/index.js" } } }));
    writeFileSync(join(stage, "dist/src/index.js"), "export {};\n"); writeFileSync(join(stage, "dist/src/index.d.ts"), "export {};\n");
    assert.equal(outputClosure(stage, replay, "0.1.0-dev.2").length, 3);
    writeFileSync(join(stage, "dist/src/bin.js"), "process.exitCode = 0;\n");
    assert.throws(() => outputClosure(stage, replay, "0.1.0-dev.2"), /excluded-output/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
