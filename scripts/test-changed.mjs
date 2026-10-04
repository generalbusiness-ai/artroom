#!/usr/bin/env node
// Run the tests that a change affects, in each of the repository's three test runners.
//
//   npm run test:changed                 what you changed and have not committed
//   npm run test:changed -- origin/main  everything that differs from origin/main
//
// The root vitest run covers every package but git and ui, and picks the test
// files that import a changed file. The git package uses Node's test runner
// and the ui package its own vitest, so they are outside that run. Each of
// those two runs whole when a changed file is in the package or in a
// workspace package it depends on; whole, because that takes a few seconds
// and needs no import graph. A change to a root file such as package.json
// runs all three. The last lines say what ran and what was not affected.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const since = process.argv[2];
if (process.argv.length > 3 || since?.startsWith("-")) {
  console.error("usage: node scripts/test-changed.mjs [commit or branch to compare with]");
  process.exit(2);
}

function git(...args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`git ${args.join(" ")} failed:\n${r.stderr}`);
    process.exit(2);
  }
  return r.stdout.split("\n").filter(Boolean);
}
const changed = [...new Set([...git("diff", "--name-only", since ?? "HEAD"), ...git("ls-files", "--others", "--exclude-standard")])];

// The workspace packages, and for each the packages it depends on, directly or through another.
const packages = new Map();
for (const name of readdirSync(join(root, "packages"))) {
  const file = join(root, "packages", name, "package.json");
  if (!existsSync(file)) continue;
  const json = JSON.parse(readFileSync(file, "utf8"));
  packages.set(json.name, { dir: `packages/${name}/`, deps: Object.keys({ ...json.dependencies, ...json.devDependencies }) });
}
function reach(name, seen = new Set()) {
  if (seen.has(name) || !packages.has(name)) return seen;
  seen.add(name);
  for (const dep of packages.get(name).deps) reach(dep, seen);
  return seen;
}
const rootFile = changed.find((f) => !f.includes("/") && /^(package(-lock)?\.json|tsconfig.*\.json)$/.test(f));
function affects(name) {
  const dirs = [...reach(name)].map((n) => packages.get(n).dir);
  return rootFile ?? changed.find((f) => dirs.some((d) => f.startsWith(d)));
}

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
run("root vitest run", "the test files that import a changed file", "npx", ["vitest", "run", "--changed", ...(since ? [since] : [])]);
for (const [label, name] of [["git package", "@generalbusiness/artroom-git"], ["ui package", "@generalbusiness/artroom-ui"]]) {
  const because = affects(name);
  if (because) run(label, `the whole package, because ${because} changed`, "npm", ["test", "--workspace", name]);
  else results.push({ label, text: "not run: no changed file is in the package or in a package it depends on", ok: true });
}

console.error(`\nChanged files: ${changed.length}, compared with ${since ?? "HEAD"}.`);
for (const r of results) console.error(`  ${r.label}: ${r.text}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
