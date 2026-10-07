#!/usr/bin/env node
/**
 * Local demo preparation. Requires Node 26 or newer and pinned tsx 4.21.0
 * for the production TypeScript packages. Run from a scratch directory:
 * npx --yes tsx@4.21.0 /absolute/path/scripts/demo-git-host.mjs <phase> ...
 * This installs no package in the checkout and changes no package files.
 *
 * prepare creates three owner-held Ed25519 keys and stable request identities.
 * plan signs one exact install with an explicit future UTC deadline. Its seed
 * and registerScope must be pinned before deployment. Changing notAfter changes
 * that pin; the CLI never replaces a plan or automatically extends validity.
 * The signed install is public authorization data, not a private signing key.
 * Keep the private state owner-only; share the public plan deliberately.
 *
 * Generated role labels do not identify a human or prove their approval. This
 * CLI submits nothing. Future POST helpers require an explicit HTTPS base URL;
 * found also requires the actual register receipt/ref and expected revision.
 * They implement no read bootstrap, directory journey or first publication.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, intentDigest, isFactRef, isMemberId, keyIdOfSecret, parseStrict, scopeIdOf, seedDigest, signIntent, timeMs, timeOf, unb64url, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { httpTransport } from "@generalbusiness/artroom-client";
import { REGISTER } from "@generalbusiness/artroom-platform";

const PRIVATE_FILE = "private-state.json";
const PLAN_FILE = "install-plan.json";
const ROLES = ["installer", "founder", "recovery"];
const HOST = "github.com";
const NAMESPACE = "generalbusiness-ai";
const CODE = new Set(["node26-required", "invalid-arguments", "invalid-directory", "checkout-directory", "directory-exists", "private-permissions", "private-state-invalid", "artifact-exists", "filesystem-failed", "invalid-deadline", "invalid-plan", "invalid-register-receipt", "invalid-base-url", "request-unknown"]);
export class DemoPreparationError extends Error {
  constructor(code) { super(CODE.has(code) ? code : "filesystem-failed"); this.name = "DemoPreparationError"; this.code = this.message; }
}
const refuse = (code) => { throw new DemoPreparationError(code); };
const runtime = () => { if (Number(process.versions.node.split(".")[0]) < 26) refuse("node26-required"); };
const error = (failure, fallback) => failure instanceof DemoPreparationError ? failure : new DemoPreparationError(fallback);
const stamp = (now) => { if (!Number.isSafeInteger(now)) refuse("invalid-arguments"); return timeOf(now); };
const mode = (stat) => stat.mode & 0o777;
const owner = (stat) => typeof process.getuid === "function" && stat.uid === process.getuid();
const deadlineOf = (deadline, now) => {
  const end = timeMs(deadline);
  if (!Number.isSafeInteger(now) || end === null || end <= now || end > now + PROPOSED_BOUNDS.intentLifetimeSeconds * 1000) refuse("invalid-deadline");
  return deadline;
};

/** Resolve existing parent links before checking every ancestor for a checkout. */
async function privateDirectory(directory, existing = false) {
  if (typeof directory !== "string" || !isAbsolute(directory) || basename(directory) === "." || basename(directory) === "..") refuse("invalid-directory");
  try {
    const target = existing ? await realpath(directory) : join(await realpath(dirname(directory)), basename(directory));
    if (existing) {
      const stat = await lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink() || mode(stat) !== 0o700 || !owner(stat)) refuse("private-permissions");
    }
    for (let parent = target;; parent = dirname(parent)) {
      try { await lstat(join(parent, ".git")); refuse("checkout-directory"); }
      catch (failure) { if (failure instanceof DemoPreparationError) throw failure; if (failure.code !== "ENOENT") throw failure; }
      if (dirname(parent) === parent) break;
    }
    return target;
  } catch (failure) { throw error(failure, "invalid-directory"); }
}

async function exclusiveFile(path, value) {
  let file;
  try {
    file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    await file.chmod(0o600);
    await file.writeFile(`${canonicalize(value)}\n`, "utf8");
    await file.sync();
  } catch (failure) {
    if (failure.code === "EEXIST") refuse("artifact-exists");
    throw error(failure, "filesystem-failed");
  } finally { await file?.close(); }
}

async function readOwnerFile(directory, filename) {
  const path = join(directory, filename);
  let file;
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || mode(stat) !== 0o600 || !owner(stat) || stat.size > 32768) refuse("private-permissions");
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await file.stat();
    if (opened.ino !== stat.ino || mode(opened) !== 0o600 || !owner(opened)) refuse("private-permissions");
    return parseStrict(await file.readFile("utf8"));
  } catch (failure) { throw error(failure, "private-state-invalid"); }
  finally { await file?.close(); }
}

function checkedState(value) {
  try {
    if (value?.v !== 1 || timeMs(value.createdAt) === null || value.host !== HOST || value.namespace !== NAMESPACE || value.policy !== "keys" || value.branch !== "main" || !isMemberId(value.founderHandle) || /[\u0000-\u0020\u007f]/.test(value.founderHandle) || typeof value.installId !== "string" || typeof value.foundId !== "string" || value.installId.length === 0 || value.foundId.length === 0) refuse("private-state-invalid");
    for (const role of ROLES) {
      const key = value.roles?.[role];
      const secret = typeof key?.secret === "string" ? unb64url(key.secret) : null;
      if (key?.label !== role || secret?.length !== 32 || keyIdOfSecret(secret) !== key.key) refuse("private-state-invalid");
    }
    if (new Set(ROLES.map((role) => value.roles[role].key)).size !== 3) refuse("private-state-invalid");
    return value;
  } catch (failure) { throw error(failure, "private-state-invalid"); }
}
export async function readPrivateState(directory) {
  return checkedState(await readOwnerFile(await privateDirectory(directory, true), PRIVATE_FILE));
}
const publicKeys = (state) => Object.fromEntries(ROLES.map((role) => [role, { label: role, key: state.roles[role].key }]));

export async function prepare({ directory, branch, founderHandle }, now = Date.now()) {
  runtime();
  if (branch !== "main" || !isMemberId(founderHandle) || /[\u0000-\u0020\u007f]/.test(founderHandle) || Buffer.byteLength(founderHandle, "utf8") > 256) refuse("invalid-arguments");
  const target = await privateDirectory(directory);
  try { await mkdir(target, { mode: 0o700 }); await chmod(target, 0o700); }
  catch (failure) { if (failure.code === "EEXIST") refuse("directory-exists"); throw error(failure, "filesystem-failed"); }
  const roles = Object.fromEntries(ROLES.map((label) => {
    const secret = randomBytes(32);
    return [label, { label, key: keyIdOfSecret(secret), secret: b64url(secret) }];
  }));
  const state = { v: 1, createdAt: stamp(now), host: HOST, namespace: NAMESPACE, policy: "keys", branch, founderHandle, installId: `demo-install-${randomUUID()}`, foundId: `demo-found-${randomUUID()}`, roles };
  await exclusiveFile(join(target, PRIVATE_FILE), state);
  return { event: "prepared", utc: stamp(now), host: HOST, namespace: NAMESPACE, branch, founderHandle, roleKeys: publicKeys(state), installId: state.installId };
}

function installIntent(state, deadline) {
  return { v: 1, to: null, actor: state.roles.installer.key, kind: "install", on: null, expected: {}, fields: { host: HOST, namespace: NAMESPACE, policy: "keys", founders: [state.roles.founder.key] }, idempotencyKey: state.installId, notAfter: deadline };
}
export function buildPlan(state, deadline, now = Date.now()) {
  checkedState(state);
  deadlineOf(deadline, now);
  const intent = installIntent(state, deadline);
  const signedInstall = signIntent(intent, unb64url(state.roles.installer.secret));
  const registerSeed = { v: 1, kind: "register", definition: REGISTER, creator: null, cause: intentDigest(intent), ordinal: 0 };
  return { v: 1, plannedAt: stamp(now), definition: REGISTER, deadlineLocked: true, roleKeys: publicKeys(state), signedInstall, installDigest: intentDigest(intent), registerSeed, registerSeedDigest: seedDigest(registerSeed), registerScope: scopeIdOf(registerSeed), installRequest: { method: "POST", path: "/v1/scopes" }, founding: { branch: state.branch, founderHandle: state.founderHandle, recoveryKey: state.roles.recovery.key, idempotencyKey: state.foundId, requires: ["accepted-register-receipt", "expected-register-revision", "explicit-future-deadline"] } };
}
export async function plan({ directory, deadline }, now = Date.now()) {
  const target = await privateDirectory(directory, true);
  const state = await readPrivateState(target);
  const result = buildPlan(state, deadline, now);
  await exclusiveFile(join(target, PLAN_FILE), result);
  return { event: "planned", utc: stamp(now), plan: result };
}

function checkedPlan(plan) {
  try {
    const intent = plan.signedInstall.intent;
    const seed = { v: 1, kind: "register", definition: REGISTER, creator: null, cause: intentDigest(intent), ordinal: 0 };
    if (plan.v !== 1 || plan.definition !== REGISTER || !verifySignedIntent(plan.signedInstall) || intent.kind !== "install" || intent.to !== null || intent.fields.host !== HOST || intent.fields.namespace !== NAMESPACE || intent.fields.policy !== "keys" || canonicalize(seed) !== canonicalize(plan.registerSeed) || scopeIdOf(seed) !== plan.registerScope || intentDigest(intent) !== plan.installDigest || seedDigest(seed) !== plan.registerSeedDigest || timeMs(intent.notAfter) === null) refuse("invalid-plan");
    return plan;
  } catch (failure) { throw error(failure, "invalid-plan"); }
}

/** No read/bootstrap is inferred from a founding receipt. The caller supplies
 * the actual accepted install receipt and current expected register revision. */
export function buildFound(state, publicPlan, acceptedInstall, revision, deadline, now = Date.now()) {
  checkedState(state);
  const plan = checkedPlan(publicPlan);
  const fact = acceptedInstall?.receipt?.fact;
  if (acceptedInstall?.answer !== "accepted" || acceptedInstall?.receipt?.definition !== REGISTER || !isFactRef(fact) || fact.seq !== 0 || fact.at.scope !== plan.registerScope || fact.at.kind !== "register" || !Number.isSafeInteger(revision) || revision < 0 || canonicalize(installIntent(state, plan.signedInstall.intent.notAfter)) !== canonicalize(plan.signedInstall.intent)) refuse("invalid-register-receipt");
  deadlineOf(deadline, now);
  return signIntent({ v: 1, to: fact.at, actor: state.roles.founder.key, kind: "found", on: null, expected: { register: revision }, fields: { branch: state.branch, founderHandle: state.founderHandle, recoveryKey: state.roles.recovery.key }, idempotencyKey: state.foundId, notAfter: deadline }, unb64url(state.roles.founder.secret));
}

function transport(baseURL, send) {
  let base;
  try { base = new URL(baseURL); } catch { refuse("invalid-base-url"); }
  if (typeof baseURL !== "string" || base.protocol !== "https:" || base.username !== "" || base.password !== "" || base.search !== "" || base.hash !== "" || base.pathname !== "/" || baseURL.includes("?") || baseURL.includes("#") || baseURL.includes("\\")) refuse("invalid-base-url");
  return httpTransport(base.origin, { fetch: async (url, init) => {
    const response = await (send ?? fetch)(url, { ...init, redirect: "manual", credentials: "omit" });
    if (response.status >= 300 && response.status < 400 || response.redirected || response.url !== "" && response.url !== url) throw new DemoPreparationError("request-unknown");
    return response;
  } });
}
/** Future explicit execution: one POST, no automatic retry or configuration. */
export async function postInstall(baseURL, publicPlan, send) {
  const plan = checkedPlan(publicPlan);
  try { return await transport(baseURL, send).found(plan.signedInstall, REGISTER); }
  catch (failure) { throw error(failure, "request-unknown"); }
}
export async function postFound(baseURL, signedFound, send) {
  if (!verifySignedIntent(signedFound) || signedFound.intent.kind !== "found" || signedFound.intent.to?.kind !== "register") refuse("invalid-register-receipt");
  try { return await transport(baseURL, send).submit(signedFound.intent.to.scope, signedFound, []); }
  catch (failure) { throw error(failure, "request-unknown"); }
}

const HELP = `Requires Node 26 or newer with pinned tsx 4.21.0, run from a scratch directory.
This CLI makes no network requests.
prepare --directory <new absolute directory outside Git> --branch main --founder-handle <@handle>
plan --directory <private directory> --deadline <explicit future canonical UTC timestamp>

Private state is created once with directory mode 0700 and file mode 0600.
The plan signs an exact install and prints public data for the register pin.
Its deadline cannot be extended in place: changing it changes registerScope.
Choose a deadline within the production intent lifetime (currently 900 seconds).
Keep private-state.json private; share signed installation data deliberately.
Found execution later needs the actual register receipt and expected revision.
No read bootstrap, deployment or publication is supplied by these phases.
`;
export async function main(args = process.argv.slice(2)) {
  runtime();
  let options;
  try { options = parseArgs({ args, allowPositionals: true, strict: true, options: { directory: { type: "string" }, branch: { type: "string" }, "founder-handle": { type: "string" }, deadline: { type: "string" }, help: { type: "boolean" } } }); }
  catch { refuse("invalid-arguments"); }
  if (options.values.help || args.length === 0) { process.stdout.write(HELP); return; }
  if (options.positionals.length !== 1) refuse("invalid-arguments");
  const phase = options.positionals[0];
  const allowed = phase === "prepare" ? ["directory", "branch", "founder-handle"] : phase === "plan" ? ["directory", "deadline"] : [];
  if (allowed.length === 0 || Object.keys(options.values).some((key) => !allowed.includes(key))) refuse("invalid-arguments");
  const value = phase === "prepare" ? await prepare({ directory: options.values.directory, branch: options.values.branch, founderHandle: options.values["founder-handle"] }) : await plan({ directory: options.values.directory, deadline: options.values.deadline });
  process.stdout.write(`${canonicalize(value)}\n`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((failure) => {
    process.stderr.write(`${canonicalize({ event: "error", utc: timeOf(Date.now()), code: error(failure, "filesystem-failed").code })}\n`);
    process.exitCode = 1;
  });
}
