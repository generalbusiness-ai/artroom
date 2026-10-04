#!/usr/bin/env node
// Run the tests that a change affects.
//
//   npm run test:changed                 what you changed and have not committed
//   npm run test:changed -- origin/main  everything that differs from origin/main
//
// The root vitest run covers every active package, and picks the test files
// that import a changed file. A change to a root file such as package.json or
// the lock file runs every test. So does a changed file whose name vitest
// cannot read from git. The last lines say what ran.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const since = process.argv[2];
if (process.argv.length > 3 || since?.startsWith("-")) {
  console.error("usage: node scripts/test-changed.mjs [commit or branch to compare with]");
  process.exit(2);
}

function git(...args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(`git ${args.join(" ")} failed:\n${r.stderr}`);
    process.exit(2);
  }
  // -z: names end with NUL and are never quoted, whatever characters they hold.
  return r.stdout.split("\0").filter(Boolean);
}
const changed = [...new Set([...git("diff", "--name-only", "-z", since ?? "HEAD"), ...git("ls-files", "--others", "--exclude-standard", "-z")])];

const rootFile = changed.find((f) => !f.includes("/") && /^(package(-lock)?\.json|tsconfig.*\.json|vitest\.config\.ts)$/.test(f));

const results = [];
function run(label, why, command, args) {
  console.error(`\n== ${label}: ${why}\n`);
  const r = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  results.push({ label, text: r.status === 0 ? "passed" : r.status === null ? `did not finish (${r.signal ?? r.error?.code})` : `FAILED (exit ${r.status})`, ok: r.status === 0 });
}

if (changed.length === 0) {
  console.error(`Nothing differs from ${since ?? "HEAD"}: no tests to run.`);
  process.exit(0);
}
// vitest reads the changed names from git without -z, so it cannot read a name git would quote. A root file
// such as the lock file is imported by no test. In both cases the selection would be wrong, so the whole run goes.
const unreadable = changed.find((f) => /[^\x21-\x7e]|["\\]/.test(f));
if (rootFile) run("root vitest run", `every test, because ${rootFile} changed`, "npx", ["vitest", "run"]);
else if (unreadable) run("root vitest run", `every test, because vitest cannot read the changed name ${JSON.stringify(unreadable)} from git`, "npx", ["vitest", "run"]);
else run("root vitest run", "the test files that import a changed file", "npx", ["vitest", "run", "--changed", ...(since ? [since] : [])]);

console.error(`\nChanged files: ${changed.length}, compared with ${since ?? "HEAD"}.`);
for (const r of results) console.error(`  ${r.label}: ${r.text}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
