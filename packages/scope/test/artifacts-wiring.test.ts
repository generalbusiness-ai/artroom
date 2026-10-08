import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type Entry, type FieldValue, type OperationId, type ScopeId, type ScopeRef, type Seed } from "@generalbusiness/artroom-contract";
import { canonicalize, digestBytes, entryHash, intentDigest, newIncarnation, scopeIdOf, signIntent, utf8 } from "@generalbusiness/artroom-bytes";
import { MemoryState, clockOf, judgeGenesis, judgeOutcome } from "@generalbusiness/artroom-derive";
import { Ledger, T0, d } from "@generalbusiness/artroom-derive/testing";
import { DESTINATION, DIRECTORY, REGISTER, directoryIdOf, repositoryName } from "@generalbusiness/artroom-platform";
import { installing, paul, registerDefinition, registerPlatform, rita, sam } from "../../platform/test/support-founding.ts";
import type { ArtifactsNamespace } from "../src/artifacts-host.ts";
import { artifactsOutside, type ArtifactsBindings } from "../src/artifacts-wiring.ts";
import { gitHubOutside, type GitHubBindings } from "../src/github-wiring.ts";
import type { OutsideGiven } from "../src/object.ts";
import { NO_OUTSIDE, type EffectAnswer, type EffectRequest } from "../src/operations.ts";
import { outsideOf } from "../src/worker.ts";
import { found } from "./support.ts";

// The hosting's own Git service is a STAND-IN here: a scripted binding
// double whose every answer the test writes. No repository or token exists.
// The register's judgments are real, in memory; SQLite is a test object's.

const NAMESPACE = "artroom-demo";
const SERVICE = "service.invalid";
const CONFIG = { namespace: NAMESPACE, host: SERVICE, maxBytes: 1024 * 1024, credentialIdentity: "adapter-attempt" };
const artifactsEnv = (registerScope: ScopeId, ns: ArtifactsNamespace): ArtifactsBindings => ({ ARTIFACTS_CONFIG: canonicalize({ ...CONFIG, registerScope }), ARTIFACTS: ns });

const ACCOUNT = { id: 285042784, login: "generalbusiness-ai", type: "Organization" } as const;
const gitHubEnv = (registerScope: ScopeId): GitHubBindings => ({
  GITHUB_APP_CONFIG: canonicalize({ issuer: "Iv1.scripted", installationId: 99, account: ACCOUNT, maxBytes: 1024 * 1024, registerScope, privateRepositories: true, publicReads: false, credentialIdentity: "adapter-attempt" }),
  GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nYQ==\n-----END PRIVATE KEY-----\n", GITHUB_CREATION_TOKEN: "operator_creation_secret", GITHUB_READ_TOKEN: "independent_read_secret",
});

/** A scripted binding: each call is logged, each answer is the test's. */
function service() {
  const calls: string[] = [];
  const script = {
    create: (name: string): unknown => ({ name, remote: `https://${SERVICE}/git/${NAMESPACE}/${name}.git`, token: "creation-plaintext" }),
    revoke: (_token: string): unknown => true,
  };
  const call = <T>(text: string, answer: () => T): Promise<T> => { calls.push(text); try { return Promise.resolve(answer()); } catch (e) { return Promise.reject(e); } };
  const ns: ArtifactsNamespace = {
    get: (name) => call(`get ${name}`, () => ({
      createToken: (scope, ttl) => call(`createToken ${name} ${scope} ${ttl}`, () => ({ id: "tok", plaintext: `${scope}-plaintext`, scope, expiresAt: "2026-10-07T13:15:00Z" })),
      revokeToken: (token) => call(`revokeToken ${name} ${token}`, () => script.revoke(token)),
      info: () => call(`info ${name}`, () => ({ name, remote: `https://${SERVICE}/git/${NAMESPACE}/${name}.git` })),
    })),
    create: (name) => call(`create ${name}`, () => script.create(name)),
    delete: (name) => call(`delete ${name}`, () => true),
  };
  return { calls, script, ns };
}

/** Real register judgments in memory, installed on `host` and `namespace`. */
function registerFixture(host: string, namespace: string, installKey = "install") {
  const register = new Ledger(registerDefinition, "platform:register");
  const intent = installing(paul, "keys", [rita.key]).intent;
  const install = signIntent({ ...intent, idempotencyKey: installKey, fields: { ...intent.fields, host, namespace } }, paul.secret);
  const seed: Seed = { v: 1, kind: "register", definition: REGISTER, creator: null, cause: intentDigest(install.intent), ordinal: 0 };
  const genesis = judgeGenesis(register.state, registerDefinition, { name: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(7)), seed, founding: install }, { clock: clockOf(register.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], source: null, platform: registerPlatform });
  expect(genesis.result).toBe("write");
  if (genesis.result === "write") register.seal(genesis.draft);
  const given: OutsideGiven = {
    state: register.state, own: register.own, retained: () => null, scope: () => register.state.scope(),
    genesis: () => { const input = register.own(0)?.entry.input; return input?.type === "genesis" ? input : null; },
    clock: { read: () => register.now }, random: { bytes: (length) => new Uint8Array(length) },
  };
  const request = (operation: OperationId, attempt = 1): EffectRequest => {
    const opened = register.state.operation(operation)!;
    return { scope: register.at, operation, attempt, owner: opened.owner, kind: opened.kind, origin: register.own(Number(operation.split(":")[0]))! };
  };
  const claim = () => {
    const found = register.act(rita, "found", { expected: { register: register.item(0).revision }, fields: { branch: "main", founderHandle: "@rita", recoveryKey: sam.key } }, { platform: registerPlatform, grants: [] });
    expect(found.result).toBe("write");
    return request("1:0");
  };
  const judge = (request: EffectRequest, reply: EffectAnswer) => {
    const judged = judgeOutcome(register.state, registerDefinition, { type: "outcome", operation: request.operation, attempt: request.attempt, result: reply.result, evidence: reply.evidence }, { clock: clockOf(register.state, T0), bounds: PROPOSED_BOUNDS, platform: registerPlatform, own: register.own });
    expect(judged.result).toBe("write");
    if (judged.result === "write") register.seal(judged.draft);
  };
  return { register, given, claim, request, judge };
}

/** SCRIPTED destination birth and state: no destination judge or mint runs.
 * Its retained register claim is the real judgment of `register`. */
function destinationGiven(register: Ledger, creator: ScopeRef): OutsideGiven {
  const claim = register.fact(1);
  const bytes = canonicalize(register.own(1)!.entry);
  const content = digestBytes(utf8(bytes));
  const seed: Seed = { v: 1, kind: "destination", definition: DESTINATION, creator, cause: d("e"), ordinal: 3 };
  const at: ScopeRef = { scope: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(3)), kind: "destination" };
  const entry: Entry = {
    ...register.own(0)!.entry, at,
    input: { type: "genesis", seed, inc: at.inc, kind: "establish", founding: null, source: null, n: null, message: null, decision: "applied" },
    uses: [{ fact: claim, content }], effects: [], sends: [],
  };
  const hash = entryHash(entry);
  const state = new MemoryState();
  state.setScope({ ...register.state.scope()!, at, creator, head: { seq: 0, hash }, genesis: { hash, source: null, n: null } });
  state.putItem({ id: 0, type: "branch", state: "empty", revision: 0, opened: hash, parties: {}, attributed: [], refs: { directory: creator as unknown as FieldValue, claim: claim as unknown as FieldValue }, values: { repository: register.item(1).values["repository"]!, name: "main" } });
  return {
    state, own: (seq) => seq === 0 ? { entry, hash } : null,
    retained: (kind, digest) => kind === "entry" && digest === content ? { kind, digest, bytes, under: "platform:register" } : null,
    scope: () => state.scope(), genesis: () => entry.input.type === "genesis" ? entry.input : null,
    clock: { read: () => register.now }, random: { bytes: (length) => new Uint8Array(length) },
  };
}

// Invariant: with the binding and an explicit setting, the pinned register
// recorded on host `artifacts` creates its claim's exact name once, the
// creation's write token is revoked at once, and only metadata is recorded.
// Another register, and a destination not born of this register's claim,
// get nothing.
test("explicit configuration creates the claim's exact name through the scripted binding, revokes its write token at once, and records host artifacts with no secret", async () => {
  const storage = await found();
  await storage.inside(async (state) => {
    const s = service();
    const f = registerFixture("artifacts", NAMESPACE);
    const env = artifactsEnv(f.register.at.scope, s.ns);
    const outside = artifactsOutside(f.given, state.storage.sql, env);
    for (const kind of ["create-repository", "delete-repository", "revoke-credential"]) expect(outside.accepts(REGISTER, kind)).toBe(true);
    expect(outside.accepts(DESTINATION, "mint")).toBe(false);
    const request = f.claim();
    const name = repositoryName(f.register.item(1).values["seed"] as never, 1);
    const reply = await outside.send(request);
    expect(reply).toEqual({ result: "confirmed", evidence: { basis: "own-answer", body: { name, id: name } } });
    expect(s.calls).toEqual([`create ${name}`, `get ${name}`, `revokeToken ${name} creation-plaintext`]);
    f.judge(request, reply!);
    expect(f.register.item(1).values["repository"]).toEqual({ host: "artifacts", namespace: NAMESPACE, name, id: name });
    expect(canonicalize(f.register.entries)).not.toContain("creation-plaintext");
    // No revocation is owed: the confirmed answer named no credential.
    expect(f.register.state.operation("2:0")).toBeNull();

    // Another valid install on the same host and namespace has another root: no authority.
    const other = registerFixture("artifacts", NAMESPACE, "alternate-install");
    const denied = artifactsOutside(other.given, state.storage.sql, env);
    expect(denied.accepts(REGISTER, "create-repository")).toBe(false);
    expect(await denied.send(other.claim())).toBeNull();
    // A destination born of this claim's directory takes effect; a forged creator, or a missing retained claim, does not.
    const expected: ScopeRef = { scope: directoryIdOf(f.register.item(1).values["seed"] as never), inc: newIncarnation(new Uint8Array(16).fill(1)), kind: "directory" };
    const unrelated: ScopeRef = { ...expected, scope: scopeIdOf({ v: 1, kind: "directory", definition: DIRECTORY, creator: null, cause: d("8"), ordinal: 0 }) };
    expect(artifactsOutside(destinationGiven(f.register, unrelated), state.storage.sql, env).accepts(DESTINATION, "mint")).toBe(false);
    const birth = destinationGiven(f.register, expected);
    expect(artifactsOutside(birth, state.storage.sql, env).accepts(DESTINATION, "mint")).toBe(true);
    expect(artifactsOutside({ ...birth, retained: () => null }, state.storage.sql, env).accepts(DESTINATION, "mint")).toBe(false);
    expect(s.calls).toHaveLength(3);
  });
});

// Invariant: a creation token whose revocation is not confirmed becomes the
// register's duty, `revoke-credential`; its send revokes the privately held
// plaintext once, and the history holds only the nonsecret handle.
test("a creation token whose revocation fails is owed: the register opens revoke-credential, and its send revokes the held token", async () => {
  const storage = await found();
  await storage.inside(async (state) => {
    const s = service();
    const f = registerFixture("artifacts", NAMESPACE);
    const outside = artifactsOutside(f.given, state.storage.sql, artifactsEnv(f.register.at.scope, s.ns));
    s.script.revoke = () => { throw new Error("connection reset"); };
    const request = f.claim();
    const name = repositoryName(f.register.item(1).values["seed"] as never, 1);
    const reply = await outside.send(request);
    expect(reply?.evidence.body).toEqual({ name, id: name, credential: `creation:${name}` });
    f.judge(request, reply!);
    const owed = f.register.state.operation("2:0");
    expect([owed?.owner, owed?.kind]).toEqual([REGISTER, "revoke-credential"]);
    s.calls.length = 0;
    s.script.revoke = () => true;
    const revoke = f.request("2:0");
    const revoked = await outside.send(revoke);
    expect(revoked).toEqual({ result: "confirmed", evidence: { basis: "own-answer", body: { credential: `creation:${name}` } } });
    expect(s.calls).toEqual([`get ${name}`, `revokeToken ${name} creation-plaintext`]);
    f.judge(revoke, revoked!);
    expect(canonicalize(f.register.entries)).not.toContain("creation-plaintext");
    // The plaintext is dropped once revoked: a later attempt has no answer and sends nothing.
    s.calls.length = 0;
    expect(await outside.send(revoke)).toBeNull();
    expect(s.calls).toEqual([]);
  });
});

// Invariant: a taken name is a refusal naming it; an unknown failure is no
// answer. Neither is sent twice.
test("a taken name is a refusal that says so, an unknown failure is no answer, and neither is sent twice", async () => {
  const storage = await found();
  await storage.inside(async (state) => {
    const s = service();
    const f = registerFixture("artifacts", NAMESPACE);
    const outside = artifactsOutside(f.given, state.storage.sql, artifactsEnv(f.register.at.scope, s.ns));
    const request = f.claim();
    const name = repositoryName(f.register.item(1).values["seed"] as never, 1);
    s.script.create = () => { throw Object.assign(new Error("taken"), { code: "ALREADY_EXISTS", numericCode: 10001 }); };
    const reply = await outside.send(request);
    expect(reply).toEqual({ result: "refused", evidence: { basis: "own-answer", body: { name, nameExists: true } } });
    s.script.create = () => { throw Object.assign(new Error("internal"), { code: "INTERNAL_ERROR", numericCode: 10400 }); };
    expect(await outside.send(request)).toBeNull();
    expect(s.calls).toEqual([`create ${name}`, `create ${name}`]);
  });
});

// Invariant: nothing takes effect without the binding and a complete,
// explicit setting.
test("absent or malformed configuration, or a missing binding, gives NO_OUTSIDE and sends nothing", async () => {
  const storage = await found();
  await storage.inside(async (state) => {
    const s = service();
    const f = registerFixture("artifacts", NAMESPACE);
    const request = f.claim();
    const scope = f.register.at.scope;
    const config = { ...CONFIG, registerScope: scope };
    const invalid: ArtifactsBindings[] = [
      {}, { ARTIFACTS: s.ns }, { ARTIFACTS_CONFIG: canonicalize(config) },
      { ARTIFACTS_CONFIG: "{", ARTIFACTS: s.ns },
      { ARTIFACTS_CONFIG: canonicalize({ ...config, credentialIdentity: "host-token-id" }), ARTIFACTS: s.ns },
      { ARTIFACTS_CONFIG: canonicalize({ ...config, registerScope: "arbitrary-root" }), ARTIFACTS: s.ns },
      { ARTIFACTS_CONFIG: canonicalize({ ...config, host: "https://service.invalid" }), ARTIFACTS: s.ns },
      { ARTIFACTS_CONFIG: canonicalize({ ...config, namespace: "" }), ARTIFACTS: s.ns },
      { ARTIFACTS_CONFIG: canonicalize({ ...config, maxBytes: 8 }), ARTIFACTS: s.ns },
      { ARTIFACTS_CONFIG: canonicalize({ ...config, extra: true }), ARTIFACTS: s.ns },
      { ARTIFACTS_CONFIG: canonicalize({ registerScope: scope, namespace: NAMESPACE, host: SERVICE, credentialIdentity: "adapter-attempt" }), ARTIFACTS: s.ns },
      { ARTIFACTS_CONFIG: canonicalize(config), ARTIFACTS: { get: s.ns.get, create: s.ns.create } },
    ];
    for (const env of invalid) {
      const outside = artifactsOutside(f.given, state.storage.sql, env);
      expect(outside).toBe(NO_OUTSIDE);
      expect(await outside.send(request)).toBeNull();
    }
    // Control: the complete setting with the binding takes effect.
    expect(artifactsOutside(f.given, state.storage.sql, artifactsEnv(scope, s.ns))).not.toBe(NO_OUTSIDE);
    expect(s.calls).toEqual([]);
  });
});

// Invariant: each wiring serves only registers recorded on its own host, and
// the deployed outside routes each scope by its recorded host; a host that
// no wiring serves gets nothing.
test("each wiring serves only its own recorded host, and the Worker's outside routes each register by its recorded host", async () => {
  const storage = await found();
  await storage.inside(async (state) => {
    const s = service();
    const fetched: string[] = [];
    const fetch = async (request: Request) => {
      fetched.push(request.url);
      const body = await request.clone().json() as { name: string };
      return new Response(JSON.stringify({ id: 71, name: body.name, owner: ACCOUNT, private: true, full_name: `${ACCOUNT.login}/${body.name}`, html_url: `https://github.com/${ACCOUNT.login}/${body.name}`, clone_url: `https://github.com/${ACCOUNT.login}/${body.name}.git` }), { status: 201, headers: { "content-type": "application/json" } });
    };
    const own = registerFixture("artifacts", NAMESPACE, "own");
    const hub = registerFixture("github.com", ACCOUNT.login, "hub");
    const elsewhere = registerFixture("git.example", NAMESPACE, "elsewhere");
    // A wiring pinned to a register recorded on the other host, under the
    // wiring's own namespace, takes no effect there: the host alone decides.
    const hubNamed = registerFixture("github.com", NAMESPACE, "hub-named");
    const ownNamed = registerFixture("artifacts", ACCOUNT.login, "own-named");
    expect(artifactsOutside(hubNamed.given, state.storage.sql, artifactsEnv(hubNamed.register.at.scope, s.ns), fetch).accepts(REGISTER, "create-repository")).toBe(false);
    expect(gitHubOutside(ownNamed.given, state.storage.sql, gitHubEnv(ownNamed.register.at.scope), fetch).accepts(REGISTER, "create-repository")).toBe(false);
    // Control: each on its own host does.
    expect(gitHubOutside(hub.given, state.storage.sql, gitHubEnv(hub.register.at.scope), fetch).accepts(REGISTER, "create-repository")).toBe(true);

    const env = { ...artifactsEnv(own.register.at.scope, s.ns), ...gitHubEnv(hub.register.at.scope) };
    const ownName = repositoryName((own.claim(), own.register.item(1).values["seed"]) as never, 1);
    expect((await outsideOf(own.given, state.storage.sql, env, fetch).send(own.request("1:0")))?.result).toBe("confirmed");
    expect([s.calls[0], fetched]).toEqual([`create ${ownName}`, []]);
    hub.claim();
    expect((await outsideOf(hub.given, state.storage.sql, env, fetch).send(hub.request("1:0")))?.result).toBe("confirmed");
    expect(fetched).toEqual([`https://api.github.com/orgs/${ACCOUNT.login}/repos`]);
    expect(s.calls).toHaveLength(3);
    elsewhere.claim();
    const none = outsideOf(elsewhere.given, state.storage.sql, env, fetch);
    expect(none.accepts(REGISTER, "create-repository")).toBe(false);
    expect(await none.send(elsewhere.request("1:0"))).toBeNull();
    // With only one host configured, the other host's register gets nothing.
    const only = outsideOf(hub.given, state.storage.sql, artifactsEnv(own.register.at.scope, s.ns), fetch);
    expect(only.accepts(REGISTER, "create-repository")).toBe(false);
    expect([fetched.length, s.calls.length]).toEqual([1, 3]);
  });
});

// Invariant: the Worker's outside port reads its setting at each call, so a
// setting that appears in an object's life takes effect at the next call;
// one that is removed stops it.
test("the Worker's outside port reads the setting at each call: a register refused with no setting is accepted once the setting appears, with no new port, and refused again once it is removed", async () => {
  const storage = await found();
  await storage.inside(async (state) => {
    const s = service();
    const f = registerFixture("artifacts", NAMESPACE);
    const env: ArtifactsBindings = { ARTIFACTS: s.ns };
    const outside = outsideOf(f.given, state.storage.sql, env);
    expect(outside.accepts(REGISTER, "create-repository")).toBe(false);
    env.ARTIFACTS_CONFIG = artifactsEnv(f.register.at.scope, s.ns).ARTIFACTS_CONFIG;
    expect(outside.accepts(REGISTER, "create-repository")).toBe(true);
    delete env.ARTIFACTS_CONFIG;
    expect([outside.accepts(REGISTER, "create-repository"), s.calls]).toEqual([false, []]);
  });
});
