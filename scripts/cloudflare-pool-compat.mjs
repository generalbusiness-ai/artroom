/**
 * Narrow backport of Cloudflare workers-sdk PR 15106 (MIT package metadata
 * retained). The original pinned package and every other file stay unchanged.
 * No installation, runtime upgrade, cache write or native authority change.
 */
import { createHash } from "node:crypto";
import { closeSync, cpSync, existsSync, lstatSync, mkdtempSync, openSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const compatibility = JSON.parse(readFileSync(new URL("./cloudflare-pool-compat.json", import.meta.url), "utf8"));
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Only these complete known bundles are supported, never a best-effort edit. */
export function inspectPool(packageRoot) {
  const metadata = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  if (metadata.name !== compatibility.package || metadata.version !== compatibility.version) throw new Error("Cloudflare pool compatibility requires the exact pinned package/version.");
  const target = join(packageRoot, compatibility.relative_bundle);
  if (!lstatSync(target).isFile() || lstatSync(target).isSymbolicLink() || !realpathSync(target).startsWith(`${realpathSync(packageRoot)}${sep}`)) throw new Error("Cloudflare pool bundle must be an ordinary file confined to its package.");
  const bytes = readFileSync(target);
  const hash = sha256(bytes);
  if (![compatibility.before_sha256, compatibility.after_sha256].includes(hash)) throw new Error("Cloudflare pool compatibility refuses an unknown complete bundle.");
  return { bytes, hash };
}

const realDirectory = path => lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink();
function packageFiles(root, prefix = "") {
  const files = [];
  for (const name of readdirSync(root).sort()) {
    const path = join(root, name), relative = prefix ? `${prefix}/${name}` : name;
    if (lstatSync(path).isDirectory()) files.push(...packageFiles(path, relative));
    else if (lstatSync(path).isFile()) files.push([relative, sha256(readFileSync(path))]);
    else throw new Error("Cloudflare pool private copy requires ordinary package files/directories.");
  }
  return files;
}
function verifyCopy(sourceFiles, staged) {
  if (JSON.stringify(packageFiles(staged)) !== JSON.stringify(sourceFiles)) throw new Error("Cloudflare pool private copy changed package bytes.");
}
function replaceLink(link, staged) {
  const previous = readlinkSync(link);
  unlinkSync(link);
  try { renameSync(staged, link); }
  catch (error) { symlinkSync(previous, link, "dir"); throw error; }
}

/** A cache-linked view receives private package bytes before any write. */
export function preparePool(root = projectRoot) {
  root = realpathSync(root);
  const modules = join(root, "node_modules");
  if (!realDirectory(modules)) throw new Error("Cloudflare pool compatibility requires owned real node_modules.");
  const namespace = join(modules, "@cloudflare");
  const packageRoot = join(namespace, "vitest-pool-workers");
  const source = realpathSync(packageRoot);
  const original = inspectPool(source); // Refuse before materializing anything.
  const sourceFiles = packageFiles(source);
  let copied = false;
  if (lstatSync(namespace).isSymbolicLink()) {
    const parent = realpathSync(namespace);
    const staged = mkdtempSync(join(modules, ".artroom-cloudflare-"));
    try {
      const entries = readdirSync(parent).sort();
      for (const entry of entries) {
        if (entry === "vitest-pool-workers") cpSync(source, join(staged, entry), { recursive: true, dereference: true });
        else symlinkSync(join(parent, entry), join(staged, entry));
      }
      if (JSON.stringify(readdirSync(staged).sort()) !== JSON.stringify(entries)) throw new Error("Cloudflare pool private namespace changed its entries.");
      verifyCopy(sourceFiles, join(staged, "vitest-pool-workers"));
      if (inspectPool(join(staged, "vitest-pool-workers")).hash !== original.hash) throw new Error("Cloudflare pool private copy changed its bundle.");
      replaceLink(namespace, staged); copied = true;
    } finally { if (existsSync(staged)) rmSync(staged, { recursive: true }); }
  } else if (!realDirectory(namespace)) {
    throw new Error("Cloudflare pool compatibility requires a real directory or cache-linked namespace.");
  } else if (lstatSync(packageRoot).isSymbolicLink()) {
    const staged = mkdtempSync(join(namespace, ".artroom-pool-"));
    try {
      cpSync(source, staged, { recursive: true, dereference: true });
      verifyCopy(sourceFiles, staged);
      if (inspectPool(staged).hash !== original.hash) throw new Error("Cloudflare pool private copy changed its bundle.");
      replaceLink(packageRoot, staged); copied = true;
    } finally { if (existsSync(staged)) rmSync(staged, { recursive: true }); }
  }
  if (!realDirectory(namespace) || !realDirectory(packageRoot) || realpathSync(packageRoot) !== packageRoot) throw new Error("Cloudflare pool package must be a private physical directory.");
  const before = inspectPool(packageRoot);
  if (before.hash === compatibility.before_sha256) {
    const text = before.bytes.toString("utf8");
    if (text.split(compatibility.before_factory).length !== 2) throw new Error("Cloudflare pool factory must occur exactly once.");
    const after = text.replace(compatibility.before_factory, compatibility.after_factory);
    if (sha256(after) !== compatibility.after_sha256) throw new Error("Cloudflare pool compatibility output hash differs.");
    const target = join(packageRoot, compatibility.relative_bundle);
    if (realpathSync(dirname(target)) !== dirname(target)) throw new Error("Cloudflare pool bundle parent must be a private physical directory.");
    const staged = `${target}.artroom-${process.pid}`;
    let ownsStaged = false;
    try {
      const fd = openSync(staged, "wx", lstatSync(target).mode & 0o777);
      ownsStaged = true;
      try { writeFileSync(fd, after); } finally { closeSync(fd); }
      renameSync(staged, target); // Also avoids writing through a shared hardlink.
      ownsStaged = false;
    } finally { if (ownsStaged && existsSync(staged)) unlinkSync(staged); }
  }
  const after = inspectPool(packageRoot);
  if (after.hash !== compatibility.after_sha256) throw new Error("Cloudflare pool compatibility final bundle differs.");
  return { package: compatibility.package, version: compatibility.version, packageRoot, copied, before: before.hash, after: after.hash };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(preparePool())); }
  catch (error) {
    console.error(error instanceof Error && error.message.startsWith("Cloudflare pool ") ? error.message : "Cloudflare pool compatibility could not prepare its owned package.");
    process.exitCode = 1;
  }
}
