// Build/pack only. Version selection does not authorize publication.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, PLAN, args, childEnv, compilerTool, compile, contained, copiedDependency, copyFileVerified, digest, json, outputClosure, productionInputs, publishManifest, references, refusal, rewriteDeclarationRefs, sourceIdentity, version, writeJson } from "./public-release-lib.mjs";

export function produce(options) {
  const source = realpathSync(options.source), selected = version(options.version);
  const identity = sourceIdentity(source, options.head);
  if (process.env.NODE_PATH) refusal("resolver-environment");
  const output = resolve(options.output), parent = realpathSync(dirname(output));
  if (parent !== dirname(output) || contained(source, output) || contained(output, source) || existsSync(output)) refusal("output-not-fresh-external");
  const npmCli = realpathSync(options["npm-cli"]), npmPackage = json(join(dirname(npmCli), "../package.json"));
  if (npmPackage.name !== "npm" || npmPackage.version !== options["npm-version"] || !lstatSync(npmCli).isFile()) refusal("npm-pin");
  const tool = compilerTool(source), lock = json(join(source, "package-lock.json"));
  mkdirSync(output); mkdirSync(join(output, "node_modules/@generalbusiness"), { recursive: true });
  mkdirSync(join(output, "tmp")); mkdirSync(join(output, "tarballs"));
  const npmUser = join(output, "npm-user.conf"), npmGlobal = join(output, "npm-global.conf");
  writeFileSync(npmUser, "", { flag: "wx" }); writeFileSync(npmGlobal, "", { flag: "wx" });
  const inputs = [], excludedInputs = [], dependencies = [], compiled = [], packages = [];
  const producerInputs = ["scripts/public-release.mjs", "scripts/public-release-lib.mjs", "scripts/public-release-modules.mjs", "scripts/public-release.json", "scripts/check-public-release.mjs"].map(path => ({ path, sha256: digest(readFileSync(join(source, path))) }));
  const thirdParty = Object.fromEntries(PLAN.packages.flatMap(spec => Object.entries(spec.dependencies).filter(([, pin]) => pin !== "coordinated")));
  for (const [name, pin] of Object.entries({ ...thirdParty, ...PLAN.checkDependencies })) dependencies.push(copiedDependency(source, output, name, pin, lock));
  for (const spec of PLAN.packages) {
    const input = join(output, "inputs", spec.dir), stage = join(output, "packages", spec.dir);
    mkdirSync(input, { recursive: true }); mkdirSync(stage, { recursive: true });
    const tracked = execFileSync("git", ["ls-files", "-z", `packages/${spec.dir}/src`, ...(spec.dir === "derive" ? ["packages/derive/test/fixtures.ts"] : [])], { cwd: source, encoding: "utf8" }).split("\0").filter(Boolean);
    const { names, omitted } = productionInputs(spec, tracked);
    for (const path of omitted) {
      const copy = join(output, "excluded", path);
      excludedInputs.push({ path, copy, ...copyFileVerified(join(source, path), copy) });
    }
    if (!names.length || names.some(name => !name.endsWith(".ts"))) refusal("unplanned-input");
    for (const name of names) {
      const relativeName = name.slice(`packages/${spec.dir}/`.length);
      inputs.push({ path: name, copy: join(input, relativeName), ...copyFileVerified(join(source, name), join(input, relativeName)) });
    }
    // Refuse unplanned source dependencies before the compiler can resolve them.
    for (const name of names) {
      const copied = join(input, name.slice(`packages/${spec.dir}/`.length));
      for (const ref of references(readFileSync(copied, "utf8"))) {
        if (ref.startsWith(".")) {
          const target = resolve(dirname(copied), ref);
          if (!contained(input, target) || !existsSync(target) || !lstatSync(target).isFile()) refusal("input-relative-closure");
        } else {
          const dependency = ref.split("/").slice(0, ref.startsWith("@") ? 2 : 1).join("/");
          if (!(dependency in spec.dependencies) || !existsSync(join(output, "node_modules", dependency, "package.json"))) refusal("input-bare-closure");
        }
      }
    }
    const namespace = join(output, "node_modules/@generalbusiness");
    if (lstatSync(namespace).isSymbolicLink() || JSON.stringify(readdirSync(namespace).sort()) !== JSON.stringify(packages.map(pkg => pkg.name.split("/")[1]).sort())) refusal("compiled-ancestor-set");
    const sourceManifest = json(join(source, `packages/${spec.dir}/package.json`));
    const manifest = publishManifest(spec, sourceManifest, selected);
    writeJson(join(stage, "package.json"), manifest);
    for (const [from, to] of [[`packages/${spec.dir}/package.json`, "source-package.json"], [`packages/${spec.dir}/README.md`, "README.md"], ["LICENSE", "LICENSE"], ["NOTICE", "NOTICE"]]) {
      const target = to === "source-package.json" ? join(input, to) : join(stage, to);
      inputs.push({ path: from, copy: target, ...copyFileVerified(join(source, from), target) });
    }
    // Build inputs have their own module marker, never an inherited workspace manifest.
    writeJson(join(input, "package.json"), { private: true, type: "module" });
    const files = names.map(name => join(input, name.slice(`packages/${spec.dir}/`.length)));
    if (["client", "derive", "platform", "replay"].includes(spec.dir)) files.push(join(output, "packages/bytes/dist/src/web.d.ts"));
    const config = join(input, "tsconfig.build.json");
    writeJson(config, { compilerOptions: {
      target: "ES2022", module: "ESNext", moduleResolution: "Bundler", lib: ["ES2022", "ESNext.Disposable"],
      strict: true, exactOptionalPropertyTypes: true, noUncheckedIndexedAccess: true, noImplicitOverride: true,
      verbatimModuleSyntax: true, isolatedModules: true, skipLibCheck: false, types: [],
      noEmit: false, declaration: true, declarationMap: false, sourceMap: false,
      allowImportingTsExtensions: true, rewriteRelativeImportExtensions: true, rootDir: input, outDir: join(stage, "dist"),
    }, files });
    const allowed = [input, join(output, "packages"), join(output, "node_modules"), tool.dir];
    compiled.push({ package: manifest.name, configSha256: digest(readFileSync(config)), files: compile(tool, config, input, allowed, join(input, "compiler.log")) });
    if (spec.dir === "bytes") copyFileVerified(join(input, "src/web.d.ts"), join(stage, "dist/src/web.d.ts"));
    const declarationRewrites = rewriteDeclarationRefs(stage);
    const stageFiles = outputClosure(stage, spec, selected);
    // Install only this completed compiled stage into the next input's ancestry.
    symlinkSync(stage, join(output, "node_modules", manifest.name), "dir");
    const packed = JSON.parse(execFileSync(process.execPath, [npmCli, "pack", "--offline", "--ignore-scripts", "--json", `--userconfig=${npmUser}`, `--globalconfig=${npmGlobal}`, `--cache=${join(output, "npm-cache")}`, `--pack-destination=${join(output, "tarballs")}`], { cwd: stage, env: childEnv(join(output, "tmp")), encoding: "utf8" }));
    if (packed.length !== 1 || packed[0].name !== manifest.name || packed[0].version !== selected || !/^[a-z0-9._-]+\.tgz$/.test(packed[0].filename) || packed[0].files.some(file => !stageFiles.some(row => row.path === file.path))) refusal("pack-inventory");
    const tarball = join(output, "tarballs", packed[0].filename), data = readFileSync(tarball);
    const integrity = `sha512-${Buffer.from(digest(data, "sha512"), "hex").toString("base64")}`;
    if (integrity !== packed[0].integrity || data.length !== packed[0].size) refusal("pack-integrity");
    packages.push({ name: manifest.name, dir: spec.dir, version: selected, manifest, declarationRewrites, files: stageFiles, packedFiles: packed[0].files, tarball: packed[0].filename, bytes: data.length, sha256: digest(data), integrity });
  }
  sourceIdentity(source, options.head);
  if ([...inputs, ...excludedInputs].some(input => digest(readFileSync(join(source, input.path))) !== input.sha256 || digest(readFileSync(input.copy)) !== input.sha256)) refusal("input-changed");
  const result = { format: "artroom-public-sdk-release-1", status: "producer-output-only-not-published", source: identity, version: selected,
    lockSha256: digest(readFileSync(join(source, "package-lock.json"))), planSha256: digest(readFileSync(join(ROOT, "scripts/public-release.json"))),
    tools: { node: process.version, nodePath: process.execPath, nodeSha256: digest(readFileSync(process.execPath)), compiler: tool, npm: { version: npmPackage.version, cli: npmCli, sha256: digest(readFileSync(npmCli)) } },
    producerInputs, inputs, excludedInputs, dependencies, compiled, packages };
  writeJson(join(output, "release-manifest.json"), result);
  return result;
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const options = args(process.argv.slice(2), ["source", "head", "version", "output", "npm-cli", "npm-version"]); produce(options); console.log("SDK producer output sealed; publication and consumer acceptance remain unproved."); }
  catch { console.error("SDK producer refused or failed; no publication was attempted. Inspect the owned staging directory and guarded inputs."); process.exitCode = 1; }
}
