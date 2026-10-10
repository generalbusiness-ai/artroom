// Four portable SDK packages only. No package loading or external service calls here.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = realpathSync(join(dirname(fileURLToPath(import.meta.url)), ".."));
export const PLAN = JSON.parse(readFileSync(new URL("./public-release.json", import.meta.url), "utf8"));
export const nameOf = (dir) => `@generalbusiness/artroom-${dir}`;
export const digest = (bytes, algorithm = "sha256") => createHash(algorithm).update(bytes).digest("hex");
export const refusal = (code) => { throw new Error(code); };
export const json = (file) => JSON.parse(readFileSync(file, "utf8"));
export const writeJson = (file, data) => writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { flag: "wx" });
export const contained = (root, file) => { const r = relative(root, file); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };
export const childEnv = (tmp) => ({ PATH: process.env.PATH ?? "", TMPDIR: tmp });

export function args(argv, names) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (!argv[i]?.startsWith("--") || !names.includes(key) || key in result || !argv[i + 1]) refusal("arguments");
    result[key] = argv[i + 1];
  }
  if (names.some(key => !(key in result))) refusal("arguments");
  return result;
}
export function version(value) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(value) || /^0\.0\.0(?:-|$)/.test(value)) refusal("version");
  return value;
}
export function sourceIdentity(root, head) {
  if (realpathSync(root) !== ROOT || !/^[0-9a-f]{40}$/.test(head)) refusal("source-identity");
  const git = (...arguments_) => execFileSync("git", arguments_, { cwd: root, encoding: "utf8" });
  if (git("rev-parse", "HEAD").trim() !== head || git("status", "--porcelain").trim()) refusal("source-not-clean-at-head");
  return { root, head, tree: git("rev-parse", "HEAD^{tree}").trim() };
}
export function inventory(root) {
  const rows = [];
  function visit(dir) {
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name), stat = lstatSync(file);
      if (stat.isDirectory()) visit(file);
      else if (stat.isFile() && !stat.isSymbolicLink()) rows.push({ path: relative(root, file).split("\\").join("/"), bytes: stat.size, sha256: digest(readFileSync(file)) });
      else refusal("nonregular-input");
    }
  }
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) refusal("unowned-directory");
  visit(root);
  return rows;
}
export function copyFileVerified(source, target) {
  if (!lstatSync(source).isFile() || lstatSync(source).isSymbolicLink()) refusal("nonregular-input");
  const bytes = readFileSync(source);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes, { flag: "wx" });
  if (digest(readFileSync(target)) !== digest(bytes)) refusal("copy-mismatch");
  return { bytes: bytes.length, sha256: digest(bytes) };
}
export function copiedDependency(sourceRoot, outputRoot, name, expected, lock) {
  const physical = realpathSync(join(sourceRoot, "node_modules", name));
  const manifest = json(join(physical, "package.json"));
  const locked = lock.packages[`node_modules/${name}`];
  if (manifest.name !== name || manifest.version !== expected || locked?.version !== expected || typeof locked.integrity !== "string") refusal("dependency-pin");
  const before = inventory(physical), target = join(outputRoot, "node_modules", name);
  mkdirSync(target, { recursive: true });
  for (const file of before) copyFileVerified(join(physical, file.path), join(target, file.path));
  if (JSON.stringify(inventory(target)) !== JSON.stringify(before)) refusal("dependency-copy-mismatch");
  return { name, version: expected, lockIntegrity: locked.integrity, source: physical, files: before };
}
export function publishManifest(spec, source, selected) {
  const keys = Object.keys(source.exports ?? {});
  if (JSON.stringify(keys.sort()) !== JSON.stringify(Object.keys(spec.exports).sort()) || source.name !== nameOf(spec.dir) || source.type !== "module" || source.license !== "Apache-2.0") refusal("unsupported-source-manifest");
  for (const [key, path] of Object.entries(spec.exports)) {
    const old = source.exports[key];
    if (path.endsWith(".d.ts") ? JSON.stringify(old) !== JSON.stringify({ types: `./${path}` }) : old !== `./${path}.ts`) refusal("unsupported-source-export");
  }
  if (JSON.stringify(Object.keys(source.dependencies ?? {}).sort()) !== JSON.stringify(Object.keys(spec.dependencies).sort())) refusal("unsupported-source-dependencies");
  for (const [name, pin] of Object.entries(spec.dependencies)) if (pin !== "coordinated" && source.dependencies[name] !== pin) refusal("dependency-pin");
  return {
    name: source.name, version: version(selected), description: source.description, license: source.license,
    type: "module", sideEffects: false, engines: source.engines,
    exports: Object.fromEntries(Object.entries(spec.exports).map(([key, path]) => [key, path.endsWith(".d.ts")
      ? { types: `./dist/${path}` } : { types: `./dist/${path}.d.ts`, default: `./dist/${path}.js` }])),
    files: ["dist", "README.md", "LICENSE", "NOTICE"], publishConfig: { access: "public" },
    ...(Object.keys(spec.dependencies).length ? { dependencies: Object.fromEntries(Object.entries(spec.dependencies).map(([name, pin]) => [name, pin === "coordinated" ? selected : pin])) } : {}),
  };
}
export function references(text) {
  // Emitted SDK ESM/declaration import specifiers; comments are not dependencies.
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  return [...clean.matchAll(/\b(?:from\s*|import\s*\(\s*|import\s+)["']([^"']+)["']/g)].map(match => match[1]);
}
/** Rewrite only relative declaration module specifiers; JavaScript is the compiler's output. */
export function rewriteDeclarationRefs(stage) {
  const changes = [];
  for (const row of inventory(stage)) {
    if (!row.path.endsWith(".d.ts")) continue;
    const file = join(stage, row.path), before = readFileSync(file, "utf8");
    const after = before.replace(/(\b(?:from\s*|import\s*\(\s*|import\s+))(["'])(\.[^"']+)\2/g,
      (all, prefix, quote, path) => path.endsWith(".ts") && !path.endsWith(".d.ts") ? `${prefix}${quote}${path.slice(0, -3)}.js${quote}` : all);
    if (before !== after) { writeFileSync(file, after); changes.push({ path: row.path, before: digest(before), after: digest(after) }); }
  }
  return changes;
}
export function outputClosure(stage, spec, selected) {
  const expected = json(join(stage, "package.json"));
  if (expected.name !== nameOf(spec.dir) || expected.version !== selected || expected.type !== "module") refusal("stage-manifest");
  const rows = inventory(stage);
  for (const row of rows) {
    if (!["package.json", "README.md", "LICENSE", "NOTICE"].includes(row.path) && (!row.path.startsWith("dist/") || !/\.(?:js|d\.ts)$/.test(row.path))) refusal("unplanned-output");
    if (row.path.startsWith("dist/test/") && !(spec.dir === "derive" && /^dist\/test\/fixtures\.(?:js|d\.ts)$/.test(row.path))) refusal("unplanned-testing-output");
    if (!row.path.startsWith("dist/") || !/\.(?:js|d\.ts)$/.test(row.path)) continue;
    for (const ref of references(readFileSync(join(stage, row.path), "utf8"))) {
      if (ref.startsWith(".")) {
        const target = resolve(dirname(join(stage, row.path)), ref);
        const actual = row.path.endsWith(".d.ts") && target.endsWith(".js") ? target.slice(0, -3) + ".d.ts" : target;
        if (!contained(stage, actual) || ref.endsWith(".ts") && !ref.endsWith(".d.ts") || !existsSync(actual) || !lstatSync(actual).isFile()) refusal("relative-output-closure");
      } else {
        const packageName = ref.split("/").slice(0, ref.startsWith("@") ? 2 : 1).join("/");
        if (!(packageName in spec.dependencies) || /^(?:node:|cloudflare:)/.test(ref) || ref.includes("/testing")) refusal("bare-output-closure");
      }
    }
  }
  for (const conditions of Object.values(expected.exports)) for (const file of Object.values(conditions)) if (!rows.some(row => `./${row.path}` === file)) refusal("missing-export");
  return rows;
}
export function compilerTool(root) {
  const dir = realpathSync(join(root, "node_modules/typescript")), manifest = json(join(dir, "package.json"));
  if (manifest.name !== "typescript" || manifest.version !== PLAN.compiler) refusal("compiler-pin");
  const bin = realpathSync(join(dir, manifest.bin.tsc));
  if (!contained(dir, bin) || !lstatSync(bin).isFile()) refusal("compiler-path");
  const nativeName = `@typescript/typescript-${process.platform}-${process.arch}`;
  const nativeDir = realpathSync(dirname(createRequire(join(dir, "package.json")).resolve(`${nativeName}/package.json`)));
  const nativeManifest = json(join(nativeDir, "package.json")), lock = json(join(root, "package-lock.json"));
  if (nativeManifest.name !== nativeName || nativeManifest.version !== PLAN.compiler || lock.packages[`node_modules/${nativeName}`]?.version !== PLAN.compiler) refusal("native-compiler-pin");
  const nativeBin = realpathSync(join(nativeDir, "lib", process.platform === "win32" ? "tsc.exe" : "tsc"));
  if (!contained(nativeDir, nativeBin) || !lstatSync(nativeBin).isFile()) refusal("native-compiler-path");
  return { dir, bin, version: manifest.version, binSha256: digest(readFileSync(bin)), packageFiles: inventory(dir),
    native: { name: nativeName, dir: nativeDir, bin: nativeBin, files: inventory(nativeDir) } };
}
export function compile(tool, config, cwd, allowed, log) {
  let result;
  try { result = execFileSync(tool.native.bin, ["-p", config, "--listFiles"], { cwd, env: childEnv(cwd), encoding: "utf8" }); }
  catch (error) { writeFileSync(log, `${error.stdout ?? ""}${error.stderr ?? ""}`, { flag: "wx" }); refusal("compiler-failed"); }
  writeFileSync(log, result, { flag: "wx" });
  const files = result.split(/\r?\n/).map(line => line.trim()).filter(line => existsSync(line) && lstatSync(line).isFile());
  if (!files.length || files.some(file => !allowed.some(root => contained(root, realpathSync(file))))) refusal("compiler-source-ancestry");
  return files.map(file => ({ path: realpathSync(file), sha256: digest(readFileSync(file)) }));
}
