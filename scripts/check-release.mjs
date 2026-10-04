#!/usr/bin/env node
// Check a packed release from outside the repository.
//
//   node scripts/check-release.mjs <release directory>     (npm run release:check -- <release directory>)
//
// <release directory> is what scripts/pack-release.mjs wrote: six tarballs and
// release-manifest.json. The check:
//   1. each tarball has the bytes and SHA-256 the manifest records;
//   2. in each tarball, every export, declaration and bin its package.json
//      names is a file in the tarball; LICENSE and NOTICE are there; no test,
//      TypeScript source or configuration file is; dependencies on Artroom
//      packages name the exact release version;
//   3. in a fresh directory outside the repository, it installs all six tarballs
//      into a copy of release/consumer, and saves the lock file as
//      <release directory>/consumer-package-lock.json;
//   4. plain Node imports every export subpath of every library (any subpath
//      listed as Worker-only must instead fail on a `cloudflare:` module), and
//      runs the compiled fixture;
//   5. `tsc --noEmit` passes under NodeNext and under bundler resolution;
//   6. `artroom-verify` (the log package's command) runs and prints its usage;
//   7. in a second fresh directory, the CLI tarball installs alone and
//      `npx artroom --help` runs.
// It uses the network only for npm's public registry (third-party packages).
// It contacts no room and no provider. It exits non-zero if any check fails.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { NOTICES, SCOPE, WORKER_ONLY, declaredFiles, root } from "./release-lib.mjs";

const releaseArg = process.argv[2];
if (!releaseArg || releaseArg.startsWith("-") || process.argv.length > 3) {
  console.error("usage: node scripts/check-release.mjs <release directory>");
  process.exit(2);
}
const releaseDir = resolve(releaseArg);
const release = JSON.parse(readFileSync(join(releaseDir, "release-manifest.json"), "utf8"));

const results = [];
const record = (check, ok, detail = "") => {
  results.push({ check, ok, detail });
  console.error(`${ok ? "ok    " : "FAILED"} ${check}${detail ? `: ${detail}` : ""}`);
  return ok;
};
function run(command, args, cwd) {
  const r = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "", text: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}
const lastLines = (text, n = 12) => text.trim().split("\n").slice(-n).join("\n");

// 1 and 2: the tarballs themselves.
const manifests = new Map();
for (const p of release.packages) {
  const file = join(releaseDir, p.file);
  const bytes = existsSync(file) ? readFileSync(file) : undefined;
  const sha256 = bytes && createHash("sha256").update(bytes).digest("hex");
  record(`${p.name}: tarball identity`, bytes?.length === p.bytes && sha256 === p.sha256, bytes ? `${p.bytes} bytes, sha256 ${p.sha256.slice(0, 16)}…` : "missing");
  if (!bytes) continue;

  const listed = run("tar", ["-tzf", file]).out.split("\n").filter(Boolean).map((f) => f.replace(/^package\//, ""));
  const manifest = JSON.parse(run("tar", ["-xzOf", file, "package/package.json"]).out);
  manifests.set(p.name, manifest);
  const missing = declaredFiles(manifest).filter((f) => !listed.includes(f.path)).map((f) => `${f.what} -> ${f.path}`);
  record(`${p.name}: exports, declarations and bins are in the tarball`, missing.length === 0, missing.join("; ") || `${declaredFiles(manifest).length} targets`);
  const notices = NOTICES.filter((f) => !listed.includes(f));
  record(`${p.name}: LICENSE and NOTICE`, notices.length === 0, notices.length ? `missing ${notices.join(", ")}` : "");
  const allowed = (f) => ["package.json", "README.md", ...NOTICES].includes(f) || /^dist\/[^/]+\.(js|d\.ts)$/.test(f) || f === "bin/artroom.js";
  const stray = listed.filter((f) => !allowed(f) || /(^|\/)(test|tests|measure|scripts|results)\//.test(f) || /\.test\./.test(f));
  record(`${p.name}: only built files`, stray.length === 0, stray.length ? stray.join(", ") : `${listed.length} files`);
  const wrong = [];
  if (manifest.version !== release.version || p.version !== release.version) wrong.push(`version ${manifest.version}`);
  if (manifest.devDependencies || manifest.scripts) wrong.push("has scripts or devDependencies");
  if (!manifest.engines?.node) wrong.push("no engines.node");
  for (const [dep, range] of Object.entries({ ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies })) {
    if (!dep.startsWith(SCOPE)) continue;
    if (!release.packages.some((q) => q.name === dep)) wrong.push(`depends on ${dep}, which is not in the release`);
    else if (range !== release.version) wrong.push(`${dep} at ${range}`);
  }
  if (p.name === `${SCOPE}cli` && manifest.dependencies) wrong.push("the CLI lists runtime dependencies");
  record(`${p.name}: version ${release.version}, exact internal dependencies, engines`, wrong.length === 0, wrong.join("; "));
}

// A fresh directory outside the repository, so nothing resolves through the workspace.
function freshDirectory(label) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `artroom-${label}-`)));
  if (!relative(realpathSync(root), dir).startsWith("..")) throw new Error(`${dir} is inside the repository`);
  for (let up = dir; up !== resolve(up, ".."); up = resolve(up, "..")) {
    if (up !== dir && (existsSync(join(up, "node_modules")) || existsSync(join(up, "package.json")))) throw new Error(`${up}, above ${dir}, has a package.json or node_modules`);
  }
  return dir;
}
const installed = (dir) => Object.keys(JSON.parse(readFileSync(join(dir, "package-lock.json"), "utf8")).packages).filter((k) => k !== "");

// 3: the complete set, in the consumer fixture.
const consumer = freshDirectory("consumer");
cpSync(join(root, "release", "consumer"), consumer, { recursive: true });
mkdirSync(join(consumer, "tarballs"));
for (const p of release.packages) copyFileSync(join(releaseDir, p.file), join(consumer, "tarballs", p.file));
const install = run("npm", ["install", "--save-exact", "--no-audit", "--no-fund", ...release.packages.map((p) => `./tarballs/${p.file}`)], consumer);
if (record("consumer: npm install of the six tarballs", install.code === 0, install.code === 0 ? consumer : lastLines(install.text))) {
  const lock = JSON.parse(readFileSync(join(consumer, "package-lock.json"), "utf8"));
  copyFileSync(join(consumer, "package-lock.json"), join(releaseDir, "consumer-package-lock.json"));
  const bad = [];
  for (const p of release.packages) {
    const entry = lock.packages[`node_modules/${p.name}`];
    const integrity = `sha512-${createHash("sha512").update(readFileSync(join(releaseDir, p.file))).digest("base64")}`;
    if (!entry || entry.link || entry.resolved !== `file:tarballs/${p.file}` || entry.integrity !== integrity || entry.version !== release.version) bad.push(p.name);
  }
  const other = Object.keys(lock.packages).filter((k) => k.includes(SCOPE) && !release.packages.some((p) => k === `node_modules/${p.name}`));
  record("consumer: the lock file names each tarball by file and integrity, with no link and no other Artroom package", bad.length === 0 && other.length === 0, [...bad, ...other].join(", ") || `${installed(consumer).length} packages; saved as ${join(releaseDir, "consumer-package-lock.json")}`);

  // 4: plain Node.
  for (const [name, manifest] of manifests) {
    for (const subpath of Object.keys(manifest.exports ?? {})) {
      const specifier = subpath === "." ? name : `${name}/${subpath.slice(2)}`;
      const r = run(process.execPath, ["--input-type=module", "-e", `const m = await import(${JSON.stringify(specifier)}); console.log(Object.keys(m).length);`], consumer);
      if ((WORKER_ONLY[name] ?? []).includes(subpath)) {
        record(`node import ${specifier} (Worker-only)`, r.code !== 0 && /cloudflare:/.test(r.err), r.code === 0 ? "it loaded in Node: it is not Worker-only" : "does not load in Node: it imports a cloudflare: module");
      } else {
        record(`node import ${specifier}`, r.code === 0, r.code === 0 ? `${r.out.trim()} runtime exports` : lastLines(r.err, 6));
      }
    }
  }
  writeFileSync(join(consumer, "run.mjs"), `import { describe } from "./out/use.js";\nconsole.log(await describe());\n`);
  const emit = run("npx", ["--no-install", "tsc", "-p", "tsconfig.nodenext.json", "--noEmit", "false", "--rootDir", "src", "--outDir", "out"], consumer);
  const ran = emit.code === 0 ? run(process.execPath, ["run.mjs"], consumer) : emit;
  record("consumer: the fixture, compiled, runs under Node", ran.code === 0, ran.code === 0 ? ran.out.trim() : lastLines(ran.text));

  // 5: types.
  for (const config of ["tsconfig.nodenext.json", "tsconfig.bundler.json"]) {
    const r = run("npx", ["--no-install", "tsc", "--noEmit", "-p", config], consumer);
    record(`consumer: tsc --noEmit -p ${config}`, r.code === 0, r.code === 0 ? "" : lastLines(r.text));
  }

  // 6: the log package's command. With no remote it prints its usage and exits 2.
  const verify = run("npx", ["--no-install", "artroom-verify"], consumer);
  record("consumer: artroom-verify prints its usage", verify.code === 2 && /usage: artroom verify/.test(verify.err), `exit ${verify.code}: ${lastLines(verify.text, 1)}`);
}

// 7: the CLI alone.
const alone = freshDirectory("cli-only");
writeFileSync(join(alone, "package.json"), `${JSON.stringify({ name: "artroom-cli-only", private: true }, null, 2)}\n`);
const cli = release.packages.find((p) => p.name === `${SCOPE}cli`);
copyFileSync(join(releaseDir, cli.file), join(alone, cli.file));
const cliInstall = run("npm", ["install", "--save-exact", "--no-audit", "--no-fund", `./${cli.file}`], alone);
if (record("cli alone: npm install of the CLI tarball", cliInstall.code === 0, cliInstall.code === 0 ? alone : lastLines(cliInstall.text))) {
  const names = installed(alone);
  record("cli alone: nothing else is installed", names.length === 1 && names[0] === `node_modules/${cli.name}`, names.join(", "));
  const help = run("npx", ["--no-install", "artroom", "--help"], alone);
  record("cli alone: npx artroom --help", help.code === 0 && /artroom/.test(help.out), `exit ${help.code}: ${help.out.trim().split("\n")[0] ?? ""}`);
  copyFileSync(join(alone, "package-lock.json"), join(releaseDir, "cli-only-package-lock.json"));
}

const failed = results.filter((r) => !r.ok);
if (failed.length === 0) {
  rmSync(consumer, { recursive: true, force: true });
  rmSync(alone, { recursive: true, force: true });
}
const width = Math.max(...results.map((r) => r.check.length));
console.log(`\nrelease ${release.version}  source commit ${release.sourceCommit}  ${release.treeClean ? "clean tree" : "TREE NOT CLEAN"}`);
for (const r of results) console.log(`${r.ok ? "pass" : "FAIL"}  ${r.check.padEnd(width)}  ${r.detail.split("\n")[0]}`);
console.log(failed.length === 0 ? `\n${results.length} checks passed` : `\n${failed.length} of ${results.length} checks FAILED; the directories are kept: ${consumer} ${alone}`);
process.exit(failed.length === 0 ? 0 : 1);
