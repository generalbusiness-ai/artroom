// What the release of the six installable packages is made from. Used by
// scripts/pack-release.mjs (which builds and packs them), by
// scripts/check-release.mjs (which installs the result outside the repository)
// and by scripts/release-manifest.test.mjs (the cheap check in the gate).
// docs/release.md explains the mechanism.
import { readFileSync } from "node:fs";
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
  out.files = [...(m.files ?? []), ...NOTICES];
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
    if (short === "cli" && Object.keys(out.dependencies ?? {}).length > 0) faults.push(`${m.name}: the bundle is self-contained and must list no runtime dependency`);
    for (const { what, path } of declaredFiles(out)) {
      if (!out.files.some((f) => path === f || path.startsWith(`${f}/`))) faults.push(`${m.name}: ${what} names ${path}, outside files`);
    }
    for (const subpath of WORKER_ONLY[m.name] ?? []) if (!(subpath in (m.exports ?? {}))) faults.push(`${m.name}: Worker-only subpath ${subpath} is not an export`);
  }
  return faults;
}
