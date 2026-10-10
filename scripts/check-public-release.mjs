// Inspect producer artifacts and exercise compiled stages only; never install/publish.
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PLAN, ROOT, args, childEnv, compile, compilerTool, contained, digest, inventory, json, nameOf, outputClosure, publishManifest, refusal, sourceIdentity, writeJson } from "./public-release-lib.mjs";

export function check(manifestFile) {
  const file = realpathSync(manifestFile), output = dirname(file), release = json(file);
  if (!lstatSync(output).isDirectory() || lstatSync(output).isSymbolicLink() || contained(ROOT, output)) refusal("check-output-ownership");
  if (release.format !== "artroom-public-sdk-release-1" || release.status !== "producer-output-only-not-published" || release.planSha256 !== digest(readFileSync(join(ROOT, "scripts/public-release.json")))) refusal("release-format");
  sourceIdentity(release.source.root, release.source.head);
  if (release.source.tree !== sourceIdentity(ROOT, release.source.head).tree || release.lockSha256 !== digest(readFileSync(join(ROOT, "package-lock.json")))) refusal("release-source");
  if (!Array.isArray(release.packages) || release.packages.length !== PLAN.packages.length) refusal("package-set");
  const tool = compilerTool(ROOT);
  if (JSON.stringify(tool) !== JSON.stringify(release.tools.compiler) || process.version !== release.tools.node || digest(readFileSync(process.execPath)) !== release.tools.nodeSha256) refusal("check-tools");
  const producerPaths = ["scripts/public-release.mjs", "scripts/public-release-lib.mjs", "scripts/public-release-modules.mjs", "scripts/public-release.json", "scripts/check-public-release.mjs"];
  if (JSON.stringify(release.producerInputs?.map(input => input.path)) !== JSON.stringify(producerPaths)) refusal("producer-input-set");
  for (const input of release.producerInputs) if (digest(readFileSync(join(ROOT, input.path))) !== input.sha256) refusal("producer-input-integrity");
  for (const input of release.inputs) {
    if (!/^(?:LICENSE|NOTICE|packages\/(?:contract|bytes|client|derive)\/(?:src\/[^\n]+\.ts|package\.json|README\.md)|packages\/derive\/test\/fixtures\.ts)$/.test(input.path) || !contained(output, realpathSync(input.copy))) refusal("input-path");
    if (digest(readFileSync(join(ROOT, input.path))) !== input.sha256 || digest(readFileSync(input.copy)) !== input.sha256) refusal("input-integrity");
  }
  const namespace = join(output, "node_modules/@generalbusiness");
  for (const dir of [join(output, "node_modules"), namespace]) if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink()) refusal("unowned-namespace");
  if (JSON.stringify(readdirSync(namespace).sort()) !== JSON.stringify(PLAN.packages.map(spec => nameOf(spec.dir).split("/")[1]).sort())) refusal("namespace-set");
  const expectedDependencies = Object.fromEntries([...PLAN.packages.flatMap(spec => Object.entries(spec.dependencies).filter(([, pin]) => pin !== "coordinated")), ...Object.entries(PLAN.checkDependencies)]);
  if (JSON.stringify(release.dependencies.map(dep => dep.name).sort()) !== JSON.stringify(Object.keys(expectedDependencies).sort())) refusal("dependency-set");
  if (release.dependencies.some(dep => expectedDependencies[dep.name] !== dep.version)) refusal("dependency-pin");
  for (const dependency of release.dependencies) {
    const dir = join(output, "node_modules", dependency.name);
    if (!contained(output, realpathSync(dir)) || JSON.stringify(inventory(dir)) !== JSON.stringify(dependency.files) || json(join(dir, "package.json")).version !== dependency.version) refusal("dependency-copy-integrity");
  }
  for (let i = 0; i < PLAN.packages.length; i++) {
    const spec = PLAN.packages[i], packed = release.packages[i], stage = join(output, "packages", spec.dir);
    if (packed.name !== nameOf(spec.dir) || packed.version !== release.version || realpathSync(join(namespace, packed.name.split("/")[1])) !== realpathSync(stage)) refusal("compiled-stage-binding");
    const expected = publishManifest(spec, json(join(ROOT, `packages/${spec.dir}/package.json`)), release.version);
    if (JSON.stringify(json(join(stage, "package.json"))) !== JSON.stringify(expected) || JSON.stringify(packed.manifest) !== JSON.stringify(expected)) refusal("publish-manifest");
    const files = outputClosure(stage, spec, release.version);
    if (JSON.stringify(files) !== JSON.stringify(packed.files) || !/^[a-z0-9._-]+\.tgz$/.test(packed.tarball)) refusal("stage-inventory");
    const tarball = join(output, "tarballs", packed.tarball), bytes = readFileSync(tarball);
    if (bytes.length !== packed.bytes || digest(bytes) !== packed.sha256 || `sha512-${Buffer.from(digest(bytes, "sha512"), "hex").toString("base64")}` !== packed.integrity) refusal("tarball-integrity");
    const names = execFileSync("/usr/bin/tar", ["-tzf", tarball], { encoding: "utf8" }).trim().split("\n");
    if (JSON.stringify(names.slice().sort()) !== JSON.stringify(files.map(row => `package/${row.path}`).sort())) refusal("tarball-files");
    for (const row of files) if (digest(execFileSync("/usr/bin/tar", ["-xOzf", tarball, `package/${row.path}`])) !== row.sha256) refusal("tarball-content");
  }
  // The fixture's private host type must erase without changing its public ABI.
  const fixtureJs = readFileSync(join(output, "packages/derive/dist/test/fixtures.js"), "utf8");
  const fixtureTypes = readFileSync(join(output, "packages/derive/dist/test/fixtures.d.ts"), "utf8");
  if ((fixtureJs.match(/\bstructuredClone\s*\(/g) ?? []).length !== 1
    || !fixtureJs.includes("const definition = structuredClone(base);")
    || /\b(?:function|const|let|var|class)\s+structuredClone\b/.test(fixtureJs)
    || /\bstructuredClone\b|\bdeclare\s+global\b/.test(fixtureTypes)
    || !fixtureTypes.includes("export declare function variant(base: DeclaredDefinition, change: (definition: any) => void): ValidDefinition;")) refusal("fixture-clone-abi");
  // One coherent real compiled-output journey, not a native/auth SDK or registry consumer.
  const consumer = join(output, "checks");
  mkdirSync(consumer); writeJson(join(consumer, "package.json"), { private: true, type: "module" });
  const witness = `import assert from 'node:assert/strict';
import { PROPOSED_BOUNDS } from '@generalbusiness/artroom-contract';
import { canonicalBytes, keyIdOfSecret, sign, verify, verifySignedIntent } from '@generalbusiness/artroom-bytes';
import { secretSigner, signedIntent, shapeDeclaredAct } from '@generalbusiness/artroom-client';
import { validateDefinition } from '@generalbusiness/artroom-derive';
import { RULE_PROFILES, evaluate, assertEngine } from '@generalbusiness/artroom-derive/rule';
import { small, variant } from '@generalbusiness/artroom-derive/testing';
const secret = new Uint8Array(32).fill(9), message = canonicalBytes({ b:2, a:1 });
assert.equal(verify(keyIdOfSecret(secret), sign(secret,message),message),true);
assert.equal(validateDefinition(small,PROPOSED_BOUNDS,RULE_PROFILES).ok,true);
const originalSmall = canonicalBytes(small);
const cloned = variant(small, definition => { definition.name = 'compiled-clone'; definition.items.note.values.text.of.max = 201; });
assert.equal(cloned.declared.name,'compiled-clone');
assert.equal(cloned.declared.items.note.values.text.of.max,201);
assert.deepEqual(canonicalBytes(small),originalSmall);
const refused = structuredClone(small); refused.rules = { bad:'$now()' };
assert.equal(validateDefinition(refused,PROPOSED_BOUNDS,RULE_PROFILES).ok,false);
await assertEngine(); assert.equal((await evaluate('a + b',{a:1,b:2})).value,3);
const shaped = shapeDeclaredAct(small,'write',{fields:{text:'compiled output'}});
assert.equal(typeof shaped.fields.text,'string');
const signed = await signedIntent(secretSigner(secret),{to:null,kind:'install',fields:{}},{now:1791612690000,idempotencyKey:'sdk-output'});
assert.equal(verifySignedIntent(signed),true);
assert.equal(signed.intent.idempotencyKey,'sdk-output');
`;
  const runtime = join(consumer, "compiled-output.mjs"); writeFileSync(runtime, witness, { flag: "wx" });
  execFileSync(process.execPath, [runtime], { cwd: consumer, env: childEnv(join(output, "tmp")), stdio: "pipe" });
  const typed = `import type { DeclaredDefinition, Intent } from '@generalbusiness/artroom-contract';
import { canonicalBytes } from '@generalbusiness/artroom-bytes';
import { secretSigner, signedIntent, type Signer } from '@generalbusiness/artroom-client';
import { validateDefinition, type ValidDefinition } from '@generalbusiness/artroom-derive';
import { RULE_PROFILES } from '@generalbusiness/artroom-derive/rule';
import { small } from '@generalbusiness/artroom-derive/testing';
const definition: DeclaredDefinition = small;
const validation = validateDefinition(definition,{...PROPOSED_BOUNDS},RULE_PROFILES);
import { PROPOSED_BOUNDS } from '@generalbusiness/artroom-contract';
const signer: Signer = secretSigner(new Uint8Array(32));
const result: Promise<{intent:Intent;sig:string}> = signedIntent(signer,{to:null,kind:'install'});
const valid: ValidDefinition | null = validation.ok ? validation.definition : null;
canonicalBytes({result:!!result, valid:!!valid});
`;
  const use = join(consumer, "use.ts"); writeFileSync(use, typed, { flag: "wx" });
  const compilerProof = [];
  for (const mode of ["NodeNext", "Bundler"]) {
    const config = join(consumer, `tsconfig.${mode}.json`);
    writeJson(config, { compilerOptions: { target: "ES2022", module: mode === "NodeNext" ? "NodeNext" : "ESNext", moduleResolution: mode, lib: mode === "NodeNext" ? ["ES2022", "ESNext.Disposable"] : ["ES2022", "ESNext.Disposable", "DOM"], types: mode === "NodeNext" ? ["node"] : [], strict: true, skipLibCheck: false, noEmit: true }, files: [use] });
    compilerProof.push({ mode, files: compile(tool, config, consumer, [consumer, join(output, "packages"), join(output, "node_modules"), tool.dir], join(consumer, `${mode}.log`)) });
  }
  // Ambient-only bytes/web is opt-in, not a module type import or ordinary globals injection.
  const ambient = join(consumer, "ambient.ts"); writeFileSync(ambient, "new TextEncoder().encode('opt-in'); new AbortController().abort();\n", { flag: "wx" });
  const config = join(consumer, "tsconfig.ambient.json");
  writeJson(config, { compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", lib: ["ES2022", "ESNext.Disposable"], types: ["@generalbusiness/artroom-bytes/web"], strict: true, skipLibCheck: false, noEmit: true }, files: [ambient] });
  compilerProof.push({ mode: "ambient-only-no-DOM-no-Node", files: compile(tool, config, consumer, [consumer, join(output, "packages"), tool.dir], join(consumer, "ambient.log")) });
  sourceIdentity(ROOT, release.source.head);
  const result = { format: "artroom-public-sdk-output-check-1", releaseManifestSha256: digest(readFileSync(file)), packages: release.packages.map(p => ({ name: p.name, version: p.version, integrity: p.integrity })), compiledOutputJourney: "passed", testingFixtureClone: "native call preserved; private type erased; public variant signature unchanged; nested clone leaves original intact", compilerProof, qualification: "Owned staged output only. Public install/browser execution/native authorization/Jam/deployment/adoption remain unproved." };
  writeJson(join(consumer, "result.json"), result);
  return result;
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const options = args(process.argv.slice(2), ["manifest"]); check(options.manifest); console.log("Compiled SDK output checked; public publication, browser and deployed acceptance remain unproved."); }
  catch { console.error("SDK output check refused or failed. No install, publication or deployment was attempted."); process.exitCode = 1; }
}
