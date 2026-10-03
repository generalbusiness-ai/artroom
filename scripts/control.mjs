#!/usr/bin/env node
// Show that a test tells a wrong behaviour from the right one: apply one small
// change to a source file, run the named test files, and put the file back.
//
//   node scripts/control.mjs <source file> <old text> <new text> -- <package dir> <vitest args...>
//
// Example:
//   node scripts/control.mjs packages/room/src/declared.ts \
//     'if (bytes > max) break;' 'if (bytes > max + 1) break;' \
//     -- packages/room --config vitest.workers.config.ts test/workerd/declared-fd6f00b6.test.ts
//
// The change must occur exactly once in the file. The file is restored even
// if the run is interrupted. Exit code 0 means the tests failed with the
// change applied, which is what a distinguishing test does; 1 means they
// still passed. This is for one change at a time, by hand. It is not a
// mutation sweep, and docs/testing.md says why there is none.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const split = args.indexOf("--");
if (split !== 3 || args.length < 6) {
  console.error("usage: node scripts/control.mjs <source file> <old text> <new text> -- <package dir> <vitest args...>");
  process.exit(2);
}
const [file, oldText, newText] = args;
const [dir, ...vitest] = args.slice(split + 1);
const original = readFileSync(file, "utf8");
const count = original.split(oldText).length - 1;
if (count !== 1) {
  console.error(`The text to change occurs ${count} times in ${file}; it must occur exactly once.`);
  process.exit(2);
}
const restore = () => writeFileSync(file, original);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => (restore(), process.exit(130)));
let status;
try {
  writeFileSync(file, original.replace(oldText, newText));
  status = spawnSync("npx", ["vitest", "run", ...vitest], { cwd: dir, stdio: "inherit" }).status;
} finally {
  restore();
}
if (status === 0) {
  console.error("\nThe tests still pass with the change applied: they do not tell this fault from the required behaviour.");
  process.exit(1);
}
console.error("\nThe tests fail with the change applied, and the file is restored. Read the failure above: it should be the assertion you expect, not a crash or a timeout.");
