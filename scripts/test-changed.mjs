#!/usr/bin/env node
// Run the tests that a change affects, in each of the repository's test runners.
//
//   npm run test:changed                 what you changed and have not committed
//   npm run test:changed -- origin/main  everything that differs from origin/main
//
// The root vitest run covers every package but git and ui, and picks the test
// files that import a changed file. The git package uses Node's test runner
// and the ui package its own vitest, so they are outside that run. Each of
// those two runs whole when a changed file is in the package or in a
// workspace package it depends on; whole, because that takes a few seconds
// and needs no import graph. A change to a root file such as package.json or
// the lock file runs every test of all three. A changed file whose name
// vitest cannot read from git runs the whole root run; git and ui are still
// chosen by where the file is. The last lines say what ran and what was not affected.
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
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(`git ${args.join(" ")} failed:\n${r.stderr}`);
    process.exit(2);
  }
  // -z: names end with NUL and are never quoted, whatever characters they hold.
  return r.stdout.split("\0").filter(Boolean);
}
const changed = [...new Set([...git("diff", "--name-only", "-z", since ?? "HEAD"), ...git("ls-files", "--others", "--exclude-standard", "-z")])];

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
const rootFile = changed.find((f) => !f.includes("/") && /^(package(-lock)?\.json|tsconfig.*\.json|vitest\.config\.ts)$/.test(f));
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
// vitest reads the changed names from git without -z, so it cannot read a name git would quote. A root file
// such as the lock file is imported by no test. In both cases the selection would be wrong, so the whole run goes.
const unreadable = changed.find((f) => /[^\x21-\x7e]|["\\]/.test(f));
if (rootFile) run("root vitest run", `every test, because ${rootFile} changed`, "npx", ["vitest", "run"]);
else if (unreadable) run("root vitest run", `every test, because vitest cannot read the changed name ${JSON.stringify(unreadable)} from git`, "npx", ["vitest", "run"]);
else run("root vitest run", "the test files that import a changed file", "npx", ["vitest", "run", "--changed", ...(since ? [since] : [])]);
for (const [label, name] of [["git package", "@generalbusiness/artroom-git"], ["ui package", "@generalbusiness/artroom-ui"]]) {
  const because = affects(name);
  if (because) run(label, `the whole package, because ${because} changed`, "npm", ["test", "--workspace", name]);
  else results.push({ label, text: "not run: no changed file is in the package or in a package it depends on", ok: true });
}

// The release manifests have a test of their own, which reads only manifests and build configurations.
const release = rootFile ?? changed.find((f) => /^packages\/[^/]+\/(package|tsconfig\.build)\.json$/.test(f) || /^scripts\/(release-|pack-release|check-release)/.test(f) || /^release\/third-party\//.test(f));
if (release) run("release manifests", `because ${release} changed`, "node", ["--test", "scripts/release-manifest.test.mjs"]);
else results.push({ label: "release manifests", text: "not run: no package manifest, build configuration, release script or third-party record changed", ok: true });

console.error(`\nChanged files: ${changed.length}, compared with ${since ?? "HEAD"}.`);
for (const r of results) console.error(`  ${r.label}: ${r.text}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
