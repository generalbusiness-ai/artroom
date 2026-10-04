#!/usr/bin/env node
// Build and pack the six installable packages, and write a release manifest.
//
//   node scripts/pack-release.mjs <output directory>     (npm run release:pack -- <output directory>)
//
// For each package it builds `dist`, copies the built files, LICENSE and NOTICE
// into a staging directory outside the repository, writes the tarball's manifest
// there (scripts/release-lib.mjs, publishManifest) and runs `npm pack`. It writes
// <output directory>/release-manifest.json: the source commit, whether the tree
// was clean, and each tarball's name, version, file name, bytes and SHA-256.
// It publishes nothing. Run `npm ci` first. docs/release.md says more.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { NOTICES, PACKAGES, declaredFiles, manifestFaults, packageDir, publishManifest, root } from "./release-lib.mjs";

const outArg = process.argv[2];
if (!outArg || outArg.startsWith("-") || process.argv.length > 3) {
  console.error("usage: node scripts/pack-release.mjs <output directory>");
  process.exit(2);
}
const out = resolve(outArg);

function run(command, args, cwd) {
  const r = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(`${command} ${args.join(" ")} failed in ${cwd}:\n${r.stdout}${r.stderr}`);
    process.exit(1);
  }
  return r.stdout;
}

const faults = manifestFaults();
if (faults.length > 0) {
  console.error(`The package manifests are not ready for a release:\n${faults.map((f) => `  ${f}`).join("\n")}`);
  process.exit(1);
}

// The identity of the source, read before anything is built. `dist` is ignored by git.
const sourceCommit = run("git", ["rev-parse", "HEAD"], root).trim();
const sourceTree = run("git", ["rev-parse", "HEAD^{tree}"], root).trim();
const treeClean = run("git", ["status", "--porcelain"], root).trim() === "";

mkdirSync(out, { recursive: true });
const staging = mkdtempSync(join(tmpdir(), "artroom-release-"));
const packages = [];
for (const short of PACKAGES) {
  const dir = packageDir(short);
  const manifest = publishManifest(short);
  rmSync(join(dir, "dist"), { recursive: true, force: true });
  run("npm", ["run", "build", "--workspace", manifest.name], root);

  const stage = join(staging, short);
  mkdirSync(stage);
  writeFileSync(join(stage, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const file of manifest.files) cpSync(join(NOTICES.includes(file) ? root : dir, file), join(stage, file), { recursive: true });
  if (existsSync(join(dir, "README.md"))) cpSync(join(dir, "README.md"), join(stage, "README.md"));
  for (const { what, path } of declaredFiles(manifest)) {
    if (!existsSync(join(stage, path))) {
      console.error(`${manifest.name}: ${what} names ${path}, which the build did not produce`);
      process.exit(1);
    }
  }

  const [packed] = JSON.parse(run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", out], stage));
  const bytes = readFileSync(join(out, packed.filename));
  packages.push({
    name: manifest.name,
    version: manifest.version,
    file: packed.filename,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    files: packed.files.length,
    unpackedBytes: packed.unpackedSize,
  });
}
rmSync(staging, { recursive: true, force: true });

const release = {
  release: "artroom packed release, manifest version 1",
  sourceCommit,
  sourceTree,
  treeClean,
  version: packages[0].version,
  builtWith: { node: process.version, npm: run("npm", ["--version"], root).trim() },
  packages,
};
writeFileSync(join(out, "release-manifest.json"), `${JSON.stringify(release, null, 2)}\n`);

console.log(`source commit ${sourceCommit}  tree ${sourceTree}  ${treeClean ? "clean" : "NOT CLEAN: these tarballs do not identify a commit"}`);
for (const p of packages) console.log(`${p.sha256}  ${String(p.bytes).padStart(7)} bytes  ${String(p.files).padStart(3)} files  ${p.file}`);
console.log(`wrote ${join(out, "release-manifest.json")}`);
if (!treeClean) console.error("warning: the working tree has uncommitted changes; commit and pack again for a release.");
