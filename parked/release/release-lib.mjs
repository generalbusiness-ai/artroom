// What the release of the six installable packages is made from. Used by
// scripts/pack-release.mjs (which builds and packs them), by
// scripts/check-release.mjs (which installs the result outside the repository)
// and by scripts/release-manifest.test.mjs (the cheap check in the gate).
// docs/release.md explains the mechanism.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The released packages, each after the ones it depends on. */
export const PACKAGES = ["contract", "policy", "client", "mcp", "log", "cli"];
export const SCOPE = "@generalbusiness/artroom-";

/**
 * Export subpaths that load only in a Cloudflare Worker, because they import a
 * `cloudflare:` module: `{ "<package name>": ["./subpath"] }`. There is none
 * today. Every export subpath of every library loads in plain Node, including
 * the MCP package's `./worker`, which is written for a Worker but imports no
 * Worker-only module. scripts/check-release.mjs checks this in both directions.
 */
export const WORKER_ONLY = {};

/** Files every tarball carries besides its manifest's `files`. LICENSE and NOTICE come from the repository root. */
export const NOTICES = ["LICENSE", "NOTICE"];

/**
 * The one package whose build is a bundle. Its tarball holds other people's
 * code, so it also carries their licence texts in THIRD_PARTY_NOTICES.
 */
export const BUNDLED = "cli";
export const BUNDLE_FILE = "dist/artroom.js";
export const THIRD_PARTY_NOTICES = "THIRD-PARTY-NOTICES.txt";
const thirdPartyDir = join(root, "release", "third-party");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/**
 * The third-party packages whose code is in the bundle, as recorded in
 * release/third-party/packages.json, each with the bytes of its licence file.
 * `embeddedIn` names the bundled package whose own build already contains it.
 */
export function thirdParty() {
  const list = JSON.parse(readFileSync(join(thirdPartyDir, "packages.json"), "utf8"));
  return list.map((p) => ({ ...p, text: readFileSync(join(thirdPartyDir, p.licenseFile)) })).sort(byName);
}

/** What must hold of the recorded list. Returns the faults found; none is a pass. */
export function thirdPartyFaults() {
  const faults = [];
  const list = thirdParty();
  for (const p of list) {
    if (sha256(p.text) !== p.sha256) faults.push(`${p.name} ${p.version}: ${p.licenseFile} does not have the recorded SHA-256`);
    if (p.text.length === 0 || !/copyright|licen[sc]e/i.test(p.text.toString("utf8"))) faults.push(`${p.name} ${p.version}: ${p.licenseFile} is not a licence text`);
    if (list.filter((q) => q.name === p.name).length > 1) faults.push(`${p.name}: listed more than once`);
    if (p.embeddedIn) {
      if (!list.some((q) => q.name === p.embeddedIn && !q.embeddedIn)) faults.push(`${p.name}: embedded in ${p.embeddedIn}, which is not a bundled package`);
      continue;
    }
    // A package bundled directly is installed here. Its version and licence file must be the recorded ones.
    const dir = join(root, "node_modules", p.name);
    if (!existsSync(join(dir, "package.json"))) continue; // not installed: the pack fails, the cheap check does not
    const installed = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    if (installed.version !== p.version) faults.push(`${p.name}: ${installed.version} is installed, ${p.version} is recorded`);
    else if (installed.license !== p.license) faults.push(`${p.name}: declares ${installed.license}, ${p.license} is recorded`);
    else if (!existsSync(join(dir, "LICENSE")) || sha256(readFileSync(join(dir, "LICENSE"))) !== p.sha256) faults.push(`${p.name}: the installed LICENSE is not the recorded text`);
  }
  return faults;
}

/**
 * The third-party packages whose code a built bundle contains, read from the
 * bundle itself and from the installed packages. The bundler writes a comment
 * naming each module file it includes. A package named there is bundled
 * directly. If such a file has a source map, the map names the packages that
 * file was itself built from: those are embedded. Returns `{ name, version,
 * embeddedIn? }`, sorted by name.
 */
export function bundledThirdParty(bundleText) {
  const found = new Map();
  for (const [, file] of bundleText.matchAll(/^\/\/ (?:\.\.\/)*node_modules\/(\S+)$/gm)) {
    const name = file.split("/").slice(0, file.startsWith("@") ? 2 : 1).join("/");
    const path = join(root, "node_modules", file);
    if (!existsSync(path)) throw new Error(`the bundle names ${file}, which is not installed`);
    if (!found.has(name)) found.set(name, { name, version: JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")).version });
    if (!existsSync(`${path}.map`)) continue;
    for (const source of JSON.parse(readFileSync(`${path}.map`, "utf8")).sources ?? []) {
      const at = source.lastIndexOf("node_modules/");
      if (at < 0) continue;
      const inner = source.slice(at + "node_modules/".length);
      const embedded = inner.split("/").slice(0, inner.startsWith("@") ? 2 : 1).join("/");
      const store = new RegExp(`node_modules/\\.pnpm/${embedded.replace("/", "\\+").replace(/[.]/g, "\\.")}@([^_/]+)`).exec(source);
      if (!store) throw new Error(`${file}.map names ${source}, whose version cannot be read`);
      const seen = found.get(embedded);
      if (seen && seen.version !== store[1]) throw new Error(`${embedded} is in the bundle at ${seen.version} and at ${store[1]}`);
      if (!seen) found.set(embedded, { name: embedded, version: store[1], embeddedIn: name });
    }
  }
  return [...found.values()].sort(byName);
}

/** How the recorded list differs from what a bundle contains. Returns the faults found; none is a pass. */
export function bundleFaults(bundleText) {
  const key = (p) => `${p.name} ${p.version}${p.embeddedIn ? ` (embedded in ${p.embeddedIn})` : ""}`;
  const recorded = new Set(thirdParty().map(key));
  const actual = new Set(bundledThirdParty(bundleText).map(key));
  return [
    ...[...actual].filter((k) => !recorded.has(k)).map((k) => `the bundle contains ${k}, which release/third-party/packages.json does not record`),
    ...[...recorded].filter((k) => !actual.has(k)).map((k) => `release/third-party/packages.json records ${k}, which the bundle does not contain`),
  ];
}

/** The text of THIRD_PARTY_NOTICES: every recorded package, with the full text of its licence file. */
export function thirdPartyNotices(packageName, version) {
  const rule = "=".repeat(78);
  const list = thirdParty();
  const head = [
    `Third-party notices for ${packageName} ${version}`,
    "",
    `The artroom command in this package is one bundled file, ${BUNDLE_FILE}. That file`,
    "contains code from the packages listed below. For each package this file gives",
    "its name, its version, the licence it declares, and the complete text of the",
    "licence file it ships, which holds its copyright and permission notices. A",
    "package marked as embedded is part of the published build of another listed",
    "package. The Artroom code itself is under the LICENSE and NOTICE files in this",
    "package.",
    "",
    ...list.map((p) => `  ${p.name} ${p.version} (${p.license})`),
    "",
  ];
  const body = list.flatMap((p) => [
    rule,
    `${p.name} ${p.version}`,
    `Declared licence: ${p.license}`,
    p.embeddedIn ? `Included: embedded in the published build of ${p.embeddedIn}` : "Included: bundled directly",
    `SHA-256 of the licence file below: ${p.sha256}`,
    rule,
    "",
    p.text.toString("utf8").replace(/\r\n/g, "\n").replace(/\s+$/, ""),
    "",
  ]);
  return `${[...head, ...body].join("\n")}\n`;
}

export const packageDir = (short) => join(root, "packages", short);
export const readManifest = (short) => JSON.parse(readFileSync(join(packageDir(short), "package.json"), "utf8"));

const SOURCE = /^\.\/src\/(.+)\.ts$/;
/** `./src/x.ts` is built to `./dist/x.js` and `./dist/x.d.ts`. Any other target is shipped as it is. */
export const builtFrom = (target) => {
  const m = SOURCE.exec(target);
  return m ? { source: target, js: `./dist/${m[1]}.js`, types: `./dist/${m[1]}.d.ts` } : undefined;
};

/**
 * The manifest that goes into the tarball, derived from the workspace manifest.
 * Inside the repository `exports` and `bin` name TypeScript source, so tests and
 * the typecheck run from source. In the tarball the same subpaths name the built
 * JavaScript and its declarations. Scripts and development dependencies are left out.
 */
export function publishManifest(short) {
  const m = readManifest(short);
  const out = {};
  for (const key of ["name", "version", "description", "license", "type", "sideEffects"]) if (key in m) out[key] = m[key];
  if (m.exports) {
    out.exports = {};
    for (const [subpath, target] of Object.entries(m.exports)) {
      if (typeof target !== "string") throw new Error(`${m.name}: export ${subpath} must be one source path`);
      const built = builtFrom(target);
      out.exports[subpath] = built ? { types: built.types, default: built.js } : target;
    }
  }
  if (m.bin) out.bin = Object.fromEntries(Object.entries(m.bin).map(([name, target]) => [name, builtFrom(target)?.js ?? target]));
  if (m.dependencies) out.dependencies = m.dependencies;
  if (m.engines) out.engines = m.engines;
  out.files = [...(m.files ?? []), ...NOTICES, ...(short === BUNDLED ? [THIRD_PARTY_NOTICES] : [])];
  return out;
}

/** Every file a published manifest names: export targets, declarations and bins, as paths inside the package. */
export function declaredFiles(manifest) {
  const files = [];
  for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
    if (typeof target === "string") files.push({ what: `export ${subpath}`, path: target });
    else for (const [condition, path] of Object.entries(target)) files.push({ what: `export ${subpath} (${condition})`, path });
  }
  for (const key of ["main", "types"]) if (manifest[key]) files.push({ what: key, path: manifest[key] });
  for (const [name, path] of Object.entries(typeof manifest.bin === "string" ? { [manifest.name]: manifest.bin } : manifest.bin ?? {})) files.push({ what: `bin ${name}`, path });
  return files.map((f) => ({ ...f, path: f.path.replace(/^\.\//, "") }));
}

/** What must hold of the six workspace manifests for a release. Returns the faults found; none is a pass. */
export function manifestFaults() {
  const faults = [];
  const manifests = PACKAGES.map((short) => ({ short, m: readManifest(short), out: publishManifest(short) }));
  const version = manifests[0].m.version;
  const released = new Set(manifests.map(({ m }) => m.name));
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version) || /^0\.0\.0(-|$)/.test(version)) faults.push(`version ${version} is not an exact nonzero version`);
  for (const { short, m, out } of manifests) {
    if (m.name !== `${SCOPE}${short}`) faults.push(`${short}: unexpected name ${m.name}`);
    if (m.version !== version) faults.push(`${m.name}: version ${m.version} differs from ${version}`);
    if (!m.engines?.node) faults.push(`${m.name}: no engines.node`);
    if (m.license !== "Apache-2.0") faults.push(`${m.name}: licence is not Apache-2.0`);
    if (!Array.isArray(m.files) || m.files.some((f) => !["dist", "bin"].includes(f))) faults.push(`${m.name}: files must list only dist and bin`);
    for (const [dep, range] of Object.entries(out.dependencies ?? {})) {
      if (!dep.startsWith(SCOPE)) continue;
      if (!released.has(dep)) faults.push(`${m.name}: depends on ${dep}, which is not released`);
      else if (range !== version) faults.push(`${m.name}: depends on ${dep} at ${range}, not exactly ${version}`);
    }
    if (short === BUNDLED && !out.files.includes(THIRD_PARTY_NOTICES)) faults.push(`${m.name}: the bundle must carry ${THIRD_PARTY_NOTICES}`);
    if (short === "cli" && Object.keys(out.dependencies ?? {}).length > 0) faults.push(`${m.name}: the bundle is self-contained and must list no runtime dependency`);
    for (const { what, path } of declaredFiles(out)) {
      if (!out.files.some((f) => path === f || path.startsWith(`${f}/`))) faults.push(`${m.name}: ${what} names ${path}, outside files`);
    }
    for (const subpath of WORKER_ONLY[m.name] ?? []) if (!(subpath in (m.exports ?? {}))) faults.push(`${m.name}: Worker-only subpath ${subpath} is not an export`);
  }
  faults.push(...thirdPartyFaults());
  return faults;
}
