import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type Entry, type FieldValue, type ScopeId, type ScopeRef, type Seed } from "@generalbusiness/dap-contract";
import { canonicalize, digestBytes, entryHash, intentDigest, newIncarnation, scopeIdOf, signIntent, utf8 } from "@generalbusiness/artroom-bytes";
import { MemoryState, PROFILES, clockOf, judgeGenesis, judgeOutcome, validateDefinition } from "@generalbusiness/dap-derive";
import { Ledger, T0, d } from "@generalbusiness/dap-derive/testing";
import { DEMO_REGISTER, WEB_DEMO_REGISTER, DESTINATION, DIRECTORY, REGISTER, directoryIdOf, platform, repositoryName } from "@generalbusiness/dap-platform";
import { installing, paul, registerDefinition, registerPlatform, rita, sam } from "../../../packages/platform/test/support-creation.ts";
import { gitHubOutside, type GitHubBindings } from "../src/github-wiring.ts";
import { outsideOf } from "../src/worker.ts";
import type { OutsideGiven } from "../src/object.ts";
import { NO_OUTSIDE, type EffectRequest } from "../src/operations.ts";
import { create } from "./support.ts";

const ACCOUNT = { id: 285042784, login: "generalbusiness-ai", type: "Organization" } as const;
const CONFIG = { issuer: "Iv1.scripted", installationId: 99, account: ACCOUNT, maxBytes: 1024 * 1024, privateRepositories: true, publicReads: false, credentialIdentity: "adapter-attempt" };
// Syntactically shaped TEST KEY: register creation never signs or mints an App
// token. Real RSA signing is covered at the GitHub primitive's boundary.
const PRIVATE = "-----BEGIN PRIVATE KEY-----\nYQ==\n-----END PRIVATE KEY-----\n";
const CREATION = "operator_creation_secret";
const READ = "independent_read_secret";
const configuration = (registerScope: ScopeId) => ({ ...CONFIG, registerScope });
const bindings = (registerScope: ScopeId): GitHubBindings => ({ GITHUB_APP_CONFIG: canonicalize(configuration(registerScope)), GITHUB_APP_PRIVATE_KEY: PRIVATE, GITHUB_CREATION_TOKEN: CREATION, GITHUB_READ_TOKEN: READ });

/** Real register judgments in memory, with real private SQLite supplied by a test Durable Object.
 * HTTP below is a STAND-IN; no GitHub App, repository or credential is created. */
function registerFixture(installKey = "install", demo: typeof DEMO_REGISTER | typeof WEB_DEMO_REGISTER | false = false) {
  const checked = demo ? validateDefinition(platform(demo)!.data, PROPOSED_BOUNDS, PROFILES, { platform: true }) : null;
  if (checked && !checked.ok) throw new Error("Demo definition did not validate");
  const definition = checked?.ok ? checked.definition : registerDefinition;
  const rules = demo ? { named: demo, rules: platform(demo)!.rules } : registerPlatform;
  const register = new Ledger(definition, "platform:register");
  const intent = installing(paul, "keys", [rita.key]).intent;
  const install = signIntent({ ...intent, idempotencyKey: installKey, fields: demo ? { host: "github.com", namespace: ACCOUNT.login, policy: "open", purpose: "demo-start" } : { ...intent.fields, host: "github.com", namespace: ACCOUNT.login } }, paul.secret);
  const seed: Seed = { v: 1, kind: "register", definition: demo ? demo : REGISTER, creator: null, cause: intentDigest(install.intent), ordinal: 0 };
  const genesis = judgeGenesis(register.state, definition, { name: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(7)), seed, creation: install }, { clock: clockOf(register.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], source: null, platform: rules });
  expect(genesis.result).toBe("write");
  if (genesis.result === "write") register.seal(genesis.draft);
  const given: OutsideGiven = {
    state: register.state, own: register.own, retained: () => null, scope: () => register.state.scope(),
    genesis: () => { const input = register.own(0)?.entry.input; return input?.type === "genesis" ? input : null; },
    clock: { read: () => register.now }, random: { bytes: (length) => new Uint8Array(length) },
  };
  const claim = () => {
    const matched = register.act(rita, "found", { expected: { register: register.item(0).revision }, fields: { branch: "main", "founderHandle": "@rita", recoveryKey: sam.key } }, { platform: rules, grants: [] });
    expect(matched.result).toBe("write");
    const operation = register.state.operation("1:0")!;
    return { scope: register.at, operation: operation.id, attempt: 1, owner: operation.owner, kind: operation.kind, origin: register.own(1)! } satisfies EffectRequest;
  };
  return { register, given, claim };
}
const json = (body: unknown, status = 201) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** SCRIPTED destination birth and state: no destination judge or mint runs.
 * Its retained register claim is the real judgment above. This fixture proves
 * the factory's authority gate only, not a complete directory creation. */
function destinationGiven(register: Ledger, creator: ScopeRef): OutsideGiven {
  const claim = register.fact(1);
  const copy = register.own(1)!.entry;
  const bytes = canonicalize(copy);
  const content = digestBytes(utf8(bytes));
  const seed: Seed = { v: 1, kind: "destination", definition: DESTINATION, creator, cause: d("e"), ordinal: 3 };
  const at: ScopeRef = { scope: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(3)), kind: "destination" };
  const entry: Entry = {
    ...register.own(0)!.entry, at,
    input: { type: "genesis", seed, inc: at.inc, kind: "establish", "founding": null, source: null, n: null, message: null, decision: "applied" },
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

// Invariant: production configuration routes a real bound register request to
// exactly one explicitly authorized provider creation and records only metadata.
test("explicit factory configuration creates the claim's exact name through scripted HTTP and retains no secret in the judged entry", async () => {
  const storage = await create();
  await storage.inside(async (state) => {
    const f = registerFixture();
    const requests: Request[] = [];
    const env = bindings(f.register.at.scope);
    const outside = gitHubOutside(f.given, state.storage.sql, env, async (request) => {
      requests.push(request);
      const body = await request.clone().json() as { name: string };
      return json({ id: 71, name: body.name, owner: ACCOUNT, private: true, full_name: `${ACCOUNT.login}/${body.name}`, html_url: `https://github.com/${ACCOUNT.login}/${body.name}`, clone_url: `https://github.com/${ACCOUNT.login}/${body.name}.git` });
    });
    expect(outside.accepts(REGISTER, "create-repository")).toBe(true);
    expect(outside.accepts(REGISTER, "delete-repository")).toBe(false);
    expect(outside.accepts(REGISTER, "revoke-credential")).toBe(false);
    expect(outside.accepts("platform:destination@1", "mint")).toBe(false);
    const request = f.claim();
    const name = repositoryName(f.register.item(1).values["seed"] as never, 1);
    const reply = await outside.send(request);
    expect(reply).toEqual({ result: "confirmed", evidence: { basis: "own-answer", body: { name, id: "71" } } });
    const judged = judgeOutcome(f.register.state, registerDefinition, { type: "outcome", operation: request.operation, attempt: 1, result: reply!.result, evidence: reply!.evidence }, { clock: clockOf(f.register.state, T0), bounds: PROPOSED_BOUNDS, platform: registerPlatform, own: f.register.own });
    expect(judged.result).toBe("write");
    if (judged.result === "write") f.register.seal(judged.draft);
    expect(f.register.item(1).values["repository"]).toEqual({ host: "github.com", namespace: ACCOUNT.login, name, id: "71" });
    expect(requests).toHaveLength(1);
    expect([requests[0]!.method, requests[0]!.url, requests[0]!.headers.get("authorization")]).toEqual(["POST", `https://api.github.com/orgs/${ACCOUNT.login}/repos`, `Bearer ${CREATION}`]);
    expect(await requests[0]!.json()).toEqual({ name, private: true, auto_init: false });
    const history = canonicalize(f.register.entries);
    for (const secret of [CREATION, READ, PRIVATE]) expect(history).not.toContain(secret);
    expect(outside.replies?.(1)).toEqual({ answers: [], more: false });
    // Another valid caller-signed install can name the same organization and
    // policy. It has a different root seed and cannot consume this authority.
    const other = registerFixture("alternate-install");
    const denied = gitHubOutside(other.given, state.storage.sql, env, async (request) => { requests.push(request); return json({}); });
    const otherRequest = other.claim();
    expect(other.register.at.scope).not.toBe(f.register.at.scope);
    expect(denied.accepts(REGISTER, "create-repository")).toBe(false);
    expect(await denied.send(otherRequest)).toBeNull();
    expect(other.register.head.seq).toBe(1);
    expect(requests).toHaveLength(1);
    // A creator-null directory could cite this authentic claim but supply
    // another repository. Its child's factory cannot acquire App authority.
    const expected: ScopeRef = { scope: directoryIdOf(f.register.item(1).values["seed"] as never), inc: newIncarnation(new Uint8Array(16).fill(1)), kind: "directory" };
    const transport = async (request: Request) => { requests.push(request); return json({}); };
    const unrelated: ScopeRef = { ...expected, scope: scopeIdOf({ v: 1, kind: "directory", definition: DIRECTORY, creator: null, cause: d("8"), ordinal: 0 }) };
    const forged = gitHubOutside(destinationGiven(f.register, unrelated), state.storage.sql, env, transport);
    expect(forged.accepts(DESTINATION, "mint")).toBe(false);
    const birth = destinationGiven(f.register, expected);
    const legitimate = gitHubOutside(birth, state.storage.sql, env, transport);
    expect(legitimate.accepts(DESTINATION, "mint")).toBe(true);
    const missingClaim = gitHubOutside({ ...birth, retained: () => null }, state.storage.sql, env, transport);
    expect(missingClaim.accepts(DESTINATION, "mint")).toBe(false);
    expect(requests).toHaveLength(1);
  });
});

// Invariant: authority and visibility are never defaulted; unusable or missing
// operator configuration leaves the factory disabled before a provider request.
test("absent, malformed or contradictory configuration disables effects, and absent creation authority leaves creation unavailable", async () => {
  const storage = await create();
  await storage.inside(async (state) => {
    const f = registerFixture();
    const request = f.claim();
    const config = configuration(f.register.at.scope);
    const env = bindings(f.register.at.scope);
    let calls = 0;
    const transport = async () => { calls++; return json({}); };
    const invalid: GitHubBindings[] = [
      {}, { ...env, GITHUB_APP_CONFIG: "{" },
      { ...env, GITHUB_APP_CONFIG: canonicalize({ ...config, publicReads: true }) },
      { ...env, GITHUB_APP_CONFIG: canonicalize({ ...config, credentialIdentity: "host-token-id" }) },
      { ...env, GITHUB_APP_CONFIG: canonicalize({ issuer: CONFIG.issuer, installationId: 99, account: ACCOUNT, maxBytes: CONFIG.maxBytes, credentialIdentity: "adapter-attempt" }) },
      { ...env, GITHUB_APP_CONFIG: canonicalize({ ...config, registerScope: "arbitrary-root" }) },
      { ...env, GITHUB_READ_TOKEN: "" },
      { ...env, GITHUB_APP_PRIVATE_KEY: "invalid" },
      { ...env, GITHUB_CLEANUP_TOKENS: canonicalize({ 71: { name: "wrong", plaintext: "cleanup", expiresAt: "invalid" } }) },
    ];
    for (const env of invalid) {
      const outside = gitHubOutside(f.given, state.storage.sql, env, transport);
      expect(outside).toBe(NO_OUTSIDE);
      expect(await outside.send(request)).toBeNull();
    }
    // The demo opt-in binds the real native demo pin AND this runtime identity.
    // The original register remains bound when demo configuration is unusable.
    const demo=registerFixture("TEST demo adapter",DEMO_REGISTER), demoRequest=demo.claim();
    const deployment="TEST authorized demo deployment";
    const demoConfig={v:1,origin:"https://artroom-rehearsal.inguz.workers.dev",deployment,register:demo.register.at,definition:DEMO_REGISTER};
    const opted={...env,DEPLOYMENT:deployment,DEMO_START_CONFIG:canonicalize(demoConfig)};
    const enabled=gitHubOutside(demo.given,state.storage.sql,opted,transport);
    expect(enabled.accepts(DEMO_REGISTER,"create-repository")).toBe(true);
    const unrelated=gitHubOutside(demo.given,state.storage.sql,{...opted,DEPLOYMENT:"TEST unrelated deployment"},transport);
    expect(unrelated.accepts(DEMO_REGISTER,"create-repository")).toBe(false);
    expect(await unrelated.send(demoRequest)).toBeNull();
    expect(gitHubOutside(f.given,state.storage.sql,{...opted,DEPLOYMENT:"TEST unrelated deployment"},transport).accepts(REGISTER,"create-repository")).toBe(true);
    const changedInc={...demoConfig,register:{...demo.register.at,inc:newIncarnation(new Uint8Array(16).fill(11))}};
    expect(gitHubOutside(demo.given,state.storage.sql,{...opted,DEMO_START_CONFIG:canonicalize(changedInc)},transport).accepts(DEMO_REGISTER,"create-repository")).toBe(false);
    const fresh=registerFixture("TEST fresh WebDemo adapter",WEB_DEMO_REGISTER);
    const v2={...demoConfig,v:2,register:fresh.register.at,definition:WEB_DEMO_REGISTER,legacy:{register:demo.register.at,definition:DEMO_REGISTER}};
    const twoRoots={...env,DEPLOYMENT:deployment,DEMO_START_CONFIG:canonicalize(v2)};
    expect(gitHubOutside(fresh.given,state.storage.sql,twoRoots,transport).accepts(WEB_DEMO_REGISTER,"create-repository")).toBe(true);
    expect(gitHubOutside(demo.given,state.storage.sql,twoRoots,transport).accepts(DEMO_REGISTER,"create-repository")).toBe(true);
    expect(gitHubOutside(f.given,state.storage.sql,twoRoots,transport).accepts(REGISTER,"create-repository")).toBe(true);
    const unlisted=registerFixture("TEST unlisted WebDemo adapter",WEB_DEMO_REGISTER);
    expect(gitHubOutside(unlisted.given,state.storage.sql,twoRoots,transport).accepts(WEB_DEMO_REGISTER,"create-repository")).toBe(false);
    expect(gitHubOutside(fresh.given,state.storage.sql,twoRoots,transport).accepts(DEMO_REGISTER,"create-repository")).toBe(false);
    const wrongFresh={...v2,register:{...fresh.register.at,inc:newIncarnation(new Uint8Array(16).fill(12))}};
    expect(gitHubOutside(fresh.given,state.storage.sql,{...twoRoots,DEMO_START_CONFIG:canonicalize(wrongFresh)},transport).accepts(WEB_DEMO_REGISTER,"create-repository")).toBe(false);
    const wrongLegacy={...v2,legacy:{...v2.legacy,register:{...demo.register.at,inc:newIncarnation(new Uint8Array(16).fill(13))}}};
    expect(gitHubOutside(demo.given,state.storage.sql,{...twoRoots,DEMO_START_CONFIG:canonicalize(wrongLegacy)},transport).accepts(DEMO_REGISTER,"create-repository")).toBe(false);
    // The deployed same-object router must reread demo settings as well as
    // GITHUB_*; no removed root may retain the earlier provider authority.
    const live: GitHubBindings = { ...twoRoots };
    const cachedFresh = outsideOf(fresh.given, state.storage.sql, live, transport);
    const cachedLegacy = outsideOf(demo.given, state.storage.sql, live, transport);
    const cachedOriginal = outsideOf(f.given, state.storage.sql, live, transport);
    const freshRequest = fresh.claim();
    expect(cachedFresh.accepts(WEB_DEMO_REGISTER, "create-repository")).toBe(true);
    expect(cachedLegacy.accepts(DEMO_REGISTER, "create-repository")).toBe(true);
    live.DEPLOYMENT = "TEST unrelated deployment";
    expect(cachedFresh.accepts(WEB_DEMO_REGISTER, "create-repository")).toBe(false);
    expect(await cachedFresh.send(freshRequest)).toBeNull();
    expect(cachedLegacy.accepts(DEMO_REGISTER, "create-repository")).toBe(false);
    expect(await cachedLegacy.send(demoRequest)).toBeNull();
    expect(cachedOriginal.accepts(REGISTER, "create-repository")).toBe(true);
    live.DEPLOYMENT = deployment;
    expect(cachedFresh.accepts(WEB_DEMO_REGISTER, "create-repository")).toBe(true);
    delete live.DEMO_START_CONFIG;
    expect(cachedFresh.accepts(WEB_DEMO_REGISTER, "create-repository")).toBe(false);
    expect(await cachedFresh.send(freshRequest)).toBeNull();
    expect(cachedLegacy.accepts(DEMO_REGISTER, "create-repository")).toBe(false);
    expect(await cachedLegacy.send(demoRequest)).toBeNull();
    live.DEMO_START_CONFIG = canonicalize(v2);
    expect(cachedFresh.accepts(WEB_DEMO_REGISTER, "create-repository")).toBe(true);
    expect(cachedLegacy.accepts(DEMO_REGISTER, "create-repository")).toBe(true);
    const { legacy: _legacy, ...currentOnly } = v2;
    live.DEMO_START_CONFIG = canonicalize(currentOnly);
    expect(cachedFresh.accepts(WEB_DEMO_REGISTER, "create-repository")).toBe(true);
    expect(cachedLegacy.accepts(DEMO_REGISTER, "create-repository")).toBe(false);
    expect(await cachedLegacy.send(demoRequest)).toBeNull();
    expect(cachedOriginal.accepts(REGISTER, "create-repository")).toBe(true);
    const noCreation = bindings(f.register.at.scope);
    delete noCreation.GITHUB_CREATION_TOKEN;
    const outside = gitHubOutside(f.given, state.storage.sql, noCreation, transport);
    expect(outside.accepts(REGISTER, "create-repository")).toBe(false);
    expect(await outside.send(request)).toBeNull();
    // Public reads require an explicit public repository choice as well.
    const publicEnv = { ...noCreation, GITHUB_APP_CONFIG: canonicalize({ ...config, privateRepositories: false, publicReads: true }) };
    delete publicEnv.GITHUB_READ_TOKEN;
    expect(gitHubOutside(f.given, state.storage.sql, publicEnv, transport)).not.toBe(NO_OUTSIDE);
    expect(calls).toBe(0);
    expect(f.register.head.seq).toBe(1);
  });
});
