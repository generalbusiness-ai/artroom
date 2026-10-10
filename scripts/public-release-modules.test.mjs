// One coherent reproduction and closure/rewrite witness; no compiler/SDK loading.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { references, rewriteDeclarationRefs } from "./public-release-lib.mjs";

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
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
