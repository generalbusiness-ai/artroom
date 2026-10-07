import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type ScopeId, type Seed } from "@generalbusiness/artroom-contract";
import { canonicalize, intentDigest, newIncarnation, scopeIdOf, signIntent } from "@generalbusiness/artroom-bytes";
import { clockOf, judgeGenesis, judgeOutcome } from "@generalbusiness/artroom-derive";
import { Ledger, T0 } from "@generalbusiness/artroom-derive/testing";
import { REGISTER, repositoryName } from "@generalbusiness/artroom-platform";
import { installing, paul, registerDefinition, registerPlatform, rita, sam } from "../../platform/test/support-founding.ts";
import { gitHubOutside, type GitHubBindings } from "../src/github-wiring.ts";
import type { OutsideGiven } from "../src/object.ts";
import { NO_OUTSIDE, type EffectRequest } from "../src/operations.ts";
import { found } from "./support.ts";

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
function registerFixture(installKey = "install") {
  const register = new Ledger(registerDefinition, "platform:register");
  const intent = installing(paul, "keys", [rita.key]).intent;
  const install = signIntent({ ...intent, idempotencyKey: installKey, fields: { ...intent.fields, host: "github.com", namespace: ACCOUNT.login } }, paul.secret);
  const seed: Seed = { v: 1, kind: "register", definition: REGISTER, creator: null, cause: intentDigest(install.intent), ordinal: 0 };
  const genesis = judgeGenesis(register.state, registerDefinition, { name: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(7)), seed, founding: install }, { clock: clockOf(register.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], source: null, platform: registerPlatform });
  expect(genesis.result).toBe("write");
  if (genesis.result === "write") register.seal(genesis.draft);
  const given: OutsideGiven = {
    state: register.state, own: register.own, retained: () => null, scope: () => register.state.scope(),
    genesis: () => { const input = register.own(0)?.entry.input; return input?.type === "genesis" ? input : null; },
    clock: { read: () => register.now }, random: { bytes: (length) => new Uint8Array(length) },
  };
  const claim = () => {
    const found = register.act(rita, "found", { expected: { register: register.item(0).revision }, fields: { branch: "main", founderHandle: "@rita", recoveryKey: sam.key } }, { platform: registerPlatform, grants: [] });
    expect(found.result).toBe("write");
    const operation = register.state.operation("1:0")!;
    return { scope: register.at, operation: operation.id, attempt: 1, owner: operation.owner, kind: operation.kind, origin: register.own(1)! } satisfies EffectRequest;
  };
  return { register, given, claim };
}
const json = (body: unknown, status = 201) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Invariant: production configuration routes a real bound register request to
// exactly one explicitly authorized provider creation and records only metadata.
test("explicit factory configuration creates the claim's exact name through scripted HTTP and retains no secret in the judged entry", async () => {
  const storage = await found();
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
  });
});

// Invariant: authority and visibility are never defaulted; unusable or missing
// operator configuration leaves the factory disabled before a provider request.
test("absent, malformed or contradictory configuration disables effects, and absent creation authority leaves creation unavailable", async () => {
  const storage = await found();
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
