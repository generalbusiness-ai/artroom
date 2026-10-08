import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Entry, Intent, ScopeId, Seed } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, factRefOf, intentDigest, keyIdOfSecret, newIncarnation, scopeIdOf, signIntent, utf8 } from "@generalbusiness/artroom-bytes";
import { requestSession, sessionRequest, type Fetch } from "@generalbusiness/artroom-client";
import { keys } from "@generalbusiness/artroom-derive/testing";
import { DIRECTORY, REGISTER, destinationMembership, destinationReceipt, destinationTarget, foundingObjects } from "@generalbusiness/artroom-platform";
import { ZERO_ID } from "@generalbusiness/artroom-git";
import { decodePack, type DecodedObject } from "@generalbusiness/artroom-git/http-read";
import { SqliteStore, dispatchId, mintSession, readerOf, sessionsOf, signDispatchPermit, DispatchHeld, type DispatchAuthority, type DispatchContext } from "../src/index.ts";
import { gitHubOutside, type GitHubBindings } from "../src/github-wiring.ts";
import { net } from "../src/testing.ts";
import { soon } from "./net.ts";
import { Platform, rita, routed, sam, settle } from "./repository.ts";
import { reader } from "./support.ts";
import { TEST_DEPLOYMENT, platformDispatch, platformNet, platformOutside } from "./worker.ts";
import { CredentialStore } from "../src/credential-store.ts";
import { destinationMint, destinationSends } from "@generalbusiness/artroom-platform";

const ACCOUNT = { id: 285042784, login: "generalbusiness-ai", type: "Organization" } as const;
const CREATION = "operator_creation_fixture_secret";
const MAX_BYTES = 1024 * 1024;
const join = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
};
const pkt = (text: string): Uint8Array => { const bytes = utf8(text); return join(utf8((bytes.length + 4).toString(16).padStart(4, "0")), bytes); };
const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

/** STAND-IN for GitHub REST and Git smart HTTP, never an actual Git host.
 * It applies exact CAS commands to a map and decodes the received Web pack.
 * Independent tests of the Git package send those bytes to real local Git.
 * This fixture is no oracle of GitHub service behavior or eventual writes. */
class ScriptedGitHub {
  beforeReceiveAdvertisement: (() => Promise<void>) | null = null;
  name: string | null = null;
  readonly refs = new Map<string, string>();
  readonly objects = new Map<string, DecodedObject>();
  readonly minted: string[] = [];
  readonly revoked = new Set<string>();
  readonly sent: { ref: string; old: string; commit: string; plaintext: string }[] = [];
  readonly mintScopes: unknown[] = [];
  creates = 0;
  emptyAdvertisements = 0;
  readonly publicReads: string[] = [];
  readonly transportPolicies: string[] = [];

  #repository() {
    if (this.name === null) throw new Error("scripted repository has not been created");
    return { id: 71, name: this.name, owner: ACCOUNT, private: false, full_name: `${ACCOUNT.login}/${this.name}`, html_url: `https://github.com/${ACCOUNT.login}/${this.name}`, clone_url: `https://github.com/${ACCOUNT.login}/${this.name}.git` };
  }
  #advertisement(service: string): Response {
    const capabilities = service === "git-receive-pack" ? "report-status delete-refs object-format=sha1" : "ofs-delta object-format=sha1";
    const refs = [...this.refs].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    if (refs.length === 0) this.emptyAdvertisements++;
    const lines = refs.length === 0 ? [pkt(`${ZERO_ID} capabilities^{}\0${capabilities}\n`)] : refs.map(([ref, id], n) => pkt(`${id} ${ref}${n === 0 ? `\0${capabilities}` : ""}\n`));
    return new Response(join(pkt(`# service=${service}\n`), utf8("0000"), ...lines, utf8("0000")), { headers: { "content-type": `application/x-${service}-advertisement` } });
  }
  readonly fetch = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (request.method === "GET" && url.searchParams.get("service") === "git-receive-pack") await this.beforeReceiveAdvertisement?.();
    this.transportPolicies.push(request.redirect);
    expect(url.username + url.password).toBe("");
    if (url.hostname === "api.github.com") {
      if (request.method === "POST" && url.pathname === `/orgs/${ACCOUNT.login}/repos`) {
        expect(request.headers.get("authorization")).toBe(`Bearer ${CREATION}`);
        const body = await request.json() as { name: string; private: boolean; auto_init: boolean };
        expect(body).toEqual({ name: body.name, private: false, auto_init: false });
        expect(this.name).toBeNull();
        this.name = body.name;
        this.creates++;
        return json(this.#repository(), 201);
      }
      if (request.method === "POST" && url.pathname === "/app/installations/99/access_tokens") {
        expect(request.headers.get("authorization")?.startsWith("Bearer ")).toBe(true);
        const scope = await request.json();
        this.mintScopes.push(scope);
        expect(scope).toEqual({ repository_ids: [71], permissions: { contents: "write" } });
        const token = `ghs_foundation_fixture_${this.minted.length + 1}`;
        this.minted.push(token);
        return json({ token, expires_at: soon(3600), repository_selection: "selected", permissions: { contents: "write", metadata: "read" }, repositories: [this.#repository()] }, 201);
      }
      if (request.method === "DELETE" && url.pathname === "/installation/token") {
        const token = request.headers.get("authorization")?.slice("Bearer ".length);
        expect(this.minted).toContain(token);
        this.revoked.add(token!);
        return new Response(null, { status: 204 });
      }
      if (request.method === "GET" && url.pathname === `/repos/${ACCOUNT.login}/${this.name}`) {
        expect(request.headers.get("authorization")).toBeNull();
        this.publicReads.push(url.pathname);
        return json(this.#repository());
      }
      throw new Error("unexpected scripted REST request");
    }
    expect(url.hostname).toBe("github.com");
    expect(url.pathname.startsWith(`/${ACCOUNT.login}/${this.name}.git/`)).toBe(true);
    const service = url.searchParams.get("service");
    if (request.method === "GET" && service === "git-upload-pack") {
      expect(request.headers.get("authorization")).toBeNull();
      return this.#advertisement(service);
    }
    const authorization = request.headers.get("authorization");
    expect(authorization?.startsWith("Basic ")).toBe(true);
    const encoded = atob(authorization!.slice("Basic ".length));
    expect(encoded.startsWith("x-access-token:")).toBe(true);
    const token = encoded.slice("x-access-token:".length);
    expect(this.minted).toContain(token);
    expect(this.revoked.has(token)).toBe(false);
    if (request.method === "GET" && service === "git-receive-pack") return this.#advertisement(service);
    if (request.method === "POST" && url.pathname.endsWith("/git-receive-pack")) {
      const body = new Uint8Array(await request.arrayBuffer());
      const size = parseInt(new TextDecoder().decode(body.subarray(0, 4)), 16);
      const command = new TextDecoder().decode(body.subarray(4, size));
      const match = /^([0-9a-f]{40}) ([0-9a-f]{40}) ([A-Za-z0-9._/-]+)\0report-status\n$/.exec(command);
      expect(match).not.toBeNull();
      expect(new TextDecoder().decode(body.subarray(size, size + 4))).toBe("0000");
      const [old, commit, ref] = [match![1]!, match![2]!, match![3]!];
      expect(this.refs.get(ref) ?? ZERO_ID).toBe(old);
      const objects = await decodePack(body.subarray(size + 4), { maxBytes: MAX_BYTES });
      expect(objects.some((object) => object.id === commit && object.type === "commit")).toBe(true);
      for (const object of objects) this.objects.set(object.id, object);
      this.sent.push({ ref, old, commit, plaintext: token });
      this.refs.set(ref, commit);
      return new Response(join(pkt("unpack ok\n"), pkt(`ok ${ref}\n`), utf8("0000")), { headers: { "content-type": "application/x-git-receive-pack-result" } });
    }
    throw new Error("unexpected scripted Git request");
  };
}

// Invariant: a real register/directory founding reaches the actual configured
// GitHub factory and destination adapters, retains its scoped credentials in
// private SQLite, and writes only the exact founding head and own receipt.
// All five objects, platform rules, membership authority, turn/dispatch and
// Operations are real. HTTP/Git upstream and clock are labelled stand-ins;
// fixture inspection uses an explicit reader bypass, while destination reads
// below use actual membership-issued sessions. No lane, source publication or
// actual GitHub runs.
test("real PLATFORM founding through production GitHub factory writes exact first head and receipt with private revoked custody; upstream is scripted", async () => {
  const { paul } = keys;
  const keypair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const privateBytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keypair.privateKey) as ArrayBuffer);
  const privateKey = `-----BEGIN PRIVATE KEY-----\n${btoa(Array.from(privateBytes, (byte) => String.fromCharCode(byte)).join(""))}\n-----END PRIVATE KEY-----\n`;
  const install: Intent = { v: 1, to: null, actor: paul.key, kind: "install", on: null, expected: {}, fields: { host: "github.com", namespace: ACCOUNT.login, policy: "keys", founders: [rita.key] }, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
  const registerSeed: Seed = { v: 1, kind: "register", definition: REGISTER, creator: null, cause: intentDigest(install), ordinal: 0 };
  const R = new Platform(scopeIdOf(registerSeed));
  const host = new ScriptedGitHub();
  const config: GitHubBindings = {
    GITHUB_APP_CONFIG: canonicalize({ issuer: "Iv1.scripted-foundation", installationId: 99, account: ACCOUNT, maxBytes: MAX_BYTES, registerScope: R.name, privateRepositories: false, publicReads: true, credentialIdentity: "adapter-attempt" }),
    GITHUB_APP_PRIVATE_KEY: privateKey, GITHUB_CREATION_TOKEN: CREATION,
  };
  const wired = new Set<ScopeId>();
  const wire = (name: ScopeId) => {
    wired.add(name);
    platformOutside.set(name, (given, sql) => gitHubOutside(given, sql, config, host.fetch));
  };
  const priorHold = net.hold;
  const priorDeaf = net.deaf;
  const priorSessions = { sessions: platformNet.sessions, secret: platformNet.secret, inspector: platformNet.inspector };
  try {
    platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
    platformNet.inspector = reader; // Labelled fixture inspector, never native session authority.
    net.deaf = null;
    net.hold = (envelope) => {
      // Install a name-bound test factory before real namespace delivery
      // constructs each child. This callback holds no delivery and creates no
      // scope; the dispatchers still deliver every actual creation request.
      if ("definition" in envelope.to) wire(scopeIdOf(envelope.to));
      return false;
    };
    wire(R.name);
    expect(await R.stub.found(signIntent(install, paul.secret), REGISTER)).toMatchObject({ answer: "accepted" });
    const register = await R.at();
    const found = await R.intent(rita, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", founderHandle: "@rita", recoveryKey: sam.key } });
    const directorySeed: Seed = { v: 1, kind: "directory", definition: DIRECTORY, creator: register, cause: intentDigest(found.intent), ordinal: 0 };
    const D = new Platform(scopeIdOf(directorySeed));
    expect(await R.stub.submit(found, [])).toMatchObject({ answer: "accepted" });
    await (R.stub as unknown as { effect(): Promise<number> }).effect();
    await settle(R, D);
    const births = (await D.entries())[0]!.sends;
    // Kind is known from each actual creation seed, without inventing child IDs.
    const child = (kind: string) => new Platform(scopeIdOf(births.find((send) => "definition" in send.to && send.to.kind === kind)!.to as Seed));
    const membership = child("membership");
    const rules = child("rules");
    const G = child("destination");
    await settle(R, D, membership, rules, G);
    // Each real outcome can open the next operation. Drain the actual drivers,
    // including the receipt's newly opened revoke, without supplying answers.
    for (let pass = 0; pass < 32; pass++) {
      let made = 0;
      for (const node of [R, D, membership, rules, G]) {
        made += await (node.stub as unknown as { effect(): Promise<number> }).effect();
        made += await node.stub.dispatch();
      }
      if (made === 0) break;
      if (pass === 31) expect.fail("the real founding drivers did not settle");
    }
    const registerEntries = await R.entries();
    const genesis = (await G.entries())[0]!;
    const first = foundingObjects("sha1", G.name, genesis.time, factRefOf(registerEntries[1]!));
    expect(host.creates).toBe(1);
    expect(host.emptyAdvertisements).toBeGreaterThan(0);
    expect(await G.item(0)).toMatchObject({ state: "ready", values: { head: first.commit } });
    expect(host.refs.get("refs/heads/main")).toBe(first.commit);
    for (const object of first.objects) expect(host.objects.get(object.id)).toMatchObject({ type: object.kind, data: object.body });
    expect(await D.item(0)).toMatchObject({ refs: { register, membership: await membership.at(), rules: await rules.at(), destination: await G.at() }, values: { repository: { host: "github.com", namespace: ACCOUNT.login, name: host.name, id: "71" } } });
    const summaries = await Promise.all([R, D, membership, rules, G].map((node) => node.summary()));
    expect(summaries.map((summary) => [summary.value.scope.kind, summary.value.status])).toEqual([["register", "active"], ["directory", "active"], ["membership", "active"], ["rules", "active"], ["destination", "active"]]);
    const duties = await D.stub.outbox(reader);
    expect(duties.ok && duties.value.every((duty) => duty.acknowledged !== null)).toBe(true);
    const privateState = () => runInDurableObject(G.object, (_instance, state) => {
      const store = new SqliteStore({ exec: (query, ...bindings) => state.storage.sql.exec(query, ...bindings), transaction: (closure) => state.storage.transactionSync(closure) });
      const own = (seq: number) => { const row = store.stored(seq); return row ? { entry: JSON.parse(row.bytes) as Entry, hash: row.hash } : null; };
      const receipts = store.all().operations.filter((operation) => operation.kind === "receipt").map((operation) => destinationReceipt(store, own, destinationTarget(store, own, operation)!, "sha1"));
      return {
        receipts,
        credentials: state.storage.sql.exec("SELECT scope, id, mint, attempt, state, plaintext FROM private_credential ORDER BY mint").toArray(),
        revocations: state.storage.sql.exec("SELECT revoke, attempt, mint, mint_attempt, id, done FROM private_credential_revocation ORDER BY revoke").toArray(),
        owed: store.page("receipt", ["owed"], null, 10).items.length,
      };
    });
    const custody = await privateState();
    expect(custody.receipts).toHaveLength(1);
    expect(custody.owed).toBe(0);
    expect(host.refs.get(custody.receipts[0]!.ref)).toBe(custody.receipts[0]!.commit);
    for (const object of custody.receipts[0]!.objects) expect(host.objects.get(object.id)).toMatchObject({ type: object.kind, data: object.body });
    expect(host.sent.map((sent) => [sent.ref, sent.old, sent.commit])).toEqual([["refs/heads/main", ZERO_ID, first.commit], [custody.receipts[0]!.ref, ZERO_ID, custody.receipts[0]!.commit]]);
    expect(host.minted).toHaveLength(2);
    expect([...host.revoked].sort()).toEqual([...host.minted].sort());
    expect(custody.credentials).toHaveLength(2);
    expect(custody.credentials.every((credential) => credential["state"] === "revoked" && credential["plaintext"] === null && typeof credential["id"] === "string" && credential["id"].startsWith("adapter:"))).toBe(true);
    expect(custody.revocations).toHaveLength(2);
    expect(custody.revocations.every((revocation) => revocation["done"] === 1 && custody.credentials.some((credential) => credential["mint"] === revocation["mint"] && credential["attempt"] === revocation["mint_attempt"] && credential["id"] === revocation["id"]))).toBe(true);
    expect(host.transportPolicies.every((policy) => policy === "manual")).toBe(true);
    const histories = await Promise.all([R, D, membership, rules, G].map((node) => node.entries()));
    const publicHistory = canonicalize(histories);
    for (const secret of [CREATION, privateKey, ...host.minted]) expect(publicHistory).not.toContain(secret);
    const beforeRestart = { head: (await G.summary()).at, entries: histories[4], creates: host.creates, mints: host.minted.length, revokes: host.revoked.size, sends: host.sent.length };
    // The first head, its receipt and both cleanups did not retain membership
    // observations. A real session must still read all these later outcomes,
    // rather than depending on the four-cause limit of a signed read.
    const recordedMembership = () => runInDurableObject(G.object, (_instance, state) => {
      const store = new SqliteStore({ exec: (query, ...bindings) => state.storage.sql.exec(query, ...bindings), transaction: (closure) => state.storage.transactionSync(closure) });
      return destinationMembership(store);
    });
    expect(await recordedMembership()).toEqual({ scope: (await membership.at()).scope, inc: null, kind: "membership" });
    const seat = await membership.did(rita, "seat", { expected: await membership.expected({ roster: 0 }) });
    await membership.did(rita, "first-key", { fields: { member: seat }, expected: await membership.expected({ roster: 0, member: seat }) });
    platformNet.sessions = true;
    const issued = await requestSession("https://scopes.test", membership.name, sessionRequest(await membership.at(), rita.secret, soon(60), "github-founding-session"), { fetch: routed as unknown as Fetch });
    expect(issued.ok).toBe(true);
    if (!issued.ok) expect.fail(`no native session: ${issued.reason}`);
    const native = issued.session.reader();
    const retainedUse = genesis.uses[0]!;
    const nativeReads = async () => {
      const history = await G.stub.history(native);
      expect(history.ok && history.value.map(({ entry }) => entry)).toEqual(beforeRestart.entries);
      const retained = await G.stub.retained(native, "entry", retainedUse.content);
      expect(retained.ok && JSON.parse(retained.value.bytes)).toEqual((await D.entries())[0]);
      expect(await recordedMembership()).toEqual({ scope: issued.session.claims.membership.scope, inc: null, kind: "membership" });
    };
    await nativeReads();
    // MAC-authentic controls under the TEST SECRET, not membership-issued
    // tokens: neither another membership ID nor another incarnation reads.
    const configured = sessionsOf(platformNet.secret, TEST_DEPLOYMENT)!;
    for (const membershipRef of [{ ...issued.session.claims.membership, scope: R.name }, { ...issued.session.claims.membership, inc: newIncarnation(new Uint8Array(16).fill(9)) }]) {
      const wrong = readerOf(mintSession(configured, { ...issued.session.claims, membership: membershipRef }));
      expect(await G.stub.history(wrong)).toMatchObject({ ok: false, reason: "forbidden" });
    }
    // Outside the runInDurableObject callback: evict the actual object life,
    // then read the same history and private SQL through its replacement.
    await G.restart();
    await nativeReads();
    expect((await G.summary()).at).toEqual(beforeRestart.head);
    expect(await G.entries()).toEqual(beforeRestart.entries);
    expect(await privateState()).toEqual(custody);
    expect({ creates: host.creates, mints: host.minted.length, revokes: host.revoked.size, sends: host.sent.length }).toEqual({ creates: beforeRestart.creates, mints: beforeRestart.mints, revokes: beforeRestart.revokes, sends: beforeRestart.sends });
  } finally {
    net.hold = priorHold;
    net.deaf = priorDeaf;
    Object.assign(platformNet, priorSessions);
    for (const name of wired) platformOutside.delete(name);
  }
});

// Invariant: a marked original Git request cannot enter its POST after its
// durable owner closes, even when nested discovery resumes; restart never
// resends it. The prerequisite/issuer/admission/bundle/capacity supplier is a
// SCRIPTED trusted-port stand-in. Scope, SQLite, signature checks, host/custody,
// smart HTTP preparation and terminal consumption are the actual code. This
// shows no production tuple, old-release drain, coordinator retirement or host.
test("registered original Git dispatch fences suspended discovery at the real scope, retains unknown duties, and never adopts an old nonce after restart", async () => {
  const { paul } = keys;
  const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey) as ArrayBuffer);
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(Array.from(raw, (byte) => String.fromCharCode(byte)).join(""))}\n-----END PRIVATE KEY-----\n`;
  const install: Intent = { v: 1, to: null, actor: paul.key, kind: "install", on: null, expected: {}, fields: { host: "github.com", namespace: ACCOUNT.login, policy: "keys", founders: [rita.key] }, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
  const R = new Platform(scopeIdOf({ v: 1, kind: "register", definition: REGISTER, creator: null, cause: intentDigest(install), ordinal: 0 }));
  const host = new ScriptedGitHub();
  const config: GitHubBindings = { GITHUB_APP_CONFIG: canonicalize({ issuer: "Iv1.scripted-fence", installationId: 99, account: ACCOUNT, maxBytes: MAX_BYTES, registerScope: R.name, privateRepositories: false, publicReads: true, credentialIdentity: "adapter-attempt" }), GITHUB_APP_PRIVATE_KEY: pem, GITHUB_CREATION_TOKEN: CREATION };
  const names = new Set<ScopeId>();
  const wire = (name: ScopeId) => {
    names.add(name);
    platformOutside.set(name, (given, sql) => {
      const outside = gitHubOutside(given, sql, config, host.fetch);
      // Fixture construction permits real judged mint custody but no write
      // dispatch. This is an unregistered legacy setup, not fenced ownership.
      return { ...outside, accepts: (owner, kind) => !["first-head", "push", "receipt"].includes(kind) && outside.accepts(owner, kind) };
    });
  };
  const oldHold = net.hold;
  let G: Platform | null = null;
  try {
    net.hold = (envelope) => { if ("definition" in envelope.to) wire(scopeIdOf(envelope.to)); return false; };
    wire(R.name);
    expect(await R.stub.found(signIntent(install, paul.secret), REGISTER)).toMatchObject({ answer: "accepted" });
    const found = await R.intent(rita, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", founderHandle: "@rita", recoveryKey: sam.key } });
    const D = new Platform(scopeIdOf({ v: 1, kind: "directory", definition: DIRECTORY, creator: await R.at(), cause: intentDigest(found.intent), ordinal: 0 }));
    expect(await R.stub.submit(found, [])).toMatchObject({ answer: "accepted" });
    await (R.stub as unknown as { effect(): Promise<number> }).effect();
    await settle(R, D);
    const births = (await D.entries())[0]!.sends;
    const children = births.filter((send) => "definition" in send.to).map((send) => new Platform(scopeIdOf(send.to as Seed)));
    G = children.find((node) => births.some((send) => "definition" in send.to && send.to.kind === "destination" && scopeIdOf(send.to) === node.name))!;
    await settle(R, D, ...children);
    await (G.stub as unknown as { effect(): Promise<number> }).effect();
    expect(host.sent).toHaveLength(0);
    const destination = G;
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const key = keyIdOfSecret(secret);
    let evidenceAvailable = false;
    let generation = 1;
    let activeContext: DispatchContext | null = null;
    let changedBinding = false;
    let bindingGuardDenied = false;
    let portCompletions = 0;
    let portCompleted: (() => void) | null = null;
    let issuedCount = 0;
    const preparedChecks: unknown[] = [];
    platformOutside.set(G.name, (given, sql) => gitHubOutside(given, sql, config, host.fetch));
    platformDispatch.set(G.name, (outside, object) => {
      const authority: DispatchAuthority = {
        current: (request) => {
          if (!evidenceAvailable) return null;
          return activeContext = { service: "scripted-service", generation, tuple: dispatchId("test-tuple", generation), coordinator: { namespace: "SCRIPTED coordinator", object: "issuer", key }, owner: { service: "scripted-service", namespace: "SCRIPTED PLATFORM trust", object, scope: request.scope, nonce: dispatchId("test-nonce", [request.scope, request.operation, request.attempt]), release: dispatchId("test-release", 1), build: dispatchId("test-build", 1) }, binding: dispatchId("test-attributed-binding", [request.scope, request.origin.hash, request.operation, request.attempt, changedBinding]), admittedBy: dispatchId("test-admission", request.origin.hash), provider: dispatchId("test-provider", ACCOUNT) };
        },
        issue: async (_request, plan) => { issuedCount++; const c = activeContext!; return signDispatchPermit(secret, { format: "artroom-send-permit-1", service: c.service, generation: c.generation, tuple: c.tuple, coordinator: c.coordinator, owner: c.owner, attempt: plan.attempt, callPlan: dispatchId("artroom-dispatch-call-plan-1", plan), purpose: "original-dispatch", duty: null, targetResolution: null }); },
      };
      if (!outside.original) expect.fail("fixture has no actual original Git adapter");
      return { authority, adapter: { prepare: async (request, context) => { const value = await outside.original!.prepare(request, context); preparedChecks.push({ kind: request.kind, site: value?.site ?? null }); return value ? { ...value, send: async (fence) => {
        // Exercise current binding in the original object's own call stack;
        // no live fence/store capability crosses fixture inspection callbacks.
        changedBinding = true;
        try { fence.consume(value.site.request); }
        catch (failure) { bindingGuardDenied = failure instanceof DispatchHeld; }
        finally { changedBinding = false; }
        try { return await value.send(fence); }
        finally { portCompletions++; portCompleted?.(); }
      } } : null; } } };
    });
    await G.restart();
    await (G.stub as unknown as { effect(): Promise<number> }).effect();
    const inspect = <T>(read: (store: SqliteStore, custody: CredentialStore) => T) => runInDurableObject(destination.object, (_instance, state) => {
      const store = new SqliteStore({ exec: (query, ...bindings) => state.storage.sql.exec(query, ...bindings), transaction: (closure) => state.storage.transactionSync(closure) });
      return read(store, new CredentialStore(state.storage.sql, () => store.scope()?.at ?? null));
    });
    expect(await inspect((store) => [store.sending("0:0", 1)?.sent, store.originalDispatch("0:0", 1)])).toEqual([null, null]);
    expect(host.sent).toHaveLength(0); // No missing-input legacy fallback.
    // Bounded phase labels distinguish the same existing waits; no timeout,
    // retry, extra RPC or native-cause conclusion is introduced.
    const phase = async <T>(name: string, ask: () => Promise<T>): Promise<T> => {
      console.info("executor witness phase", name, "start");
      const value = await ask();
      console.info("executor witness phase", name, "done");
      return value;
    };
    const runSuspendedOriginal = async () => {
      evidenceAvailable = true;
      let resume!: () => void;
      let reached!: () => void;
      const suspended = new Promise<void>((resolve) => { resume = resolve; });
      const ready = new Promise<void>((resolve) => { reached = resolve; });
      const completed = new Promise<void>((resolve) => { portCompleted = resolve; });
      host.beforeReceiveAdvertisement = async () => { reached(); await suspended; };
      try {
        await destination.restart(); // Reconsider held unsent; no invented wake.
        const pass = (destination.stub as unknown as { effect(): Promise<number> }).effect();
        const arrived = await Promise.race([ready.then(() => true), pass.then(() => false)]);
        expect(arrived, canonicalize({ issuedCount, preparedChecks, portCompletions, record: await inspect((store) => store.originalDispatch("0:0", 1)) })).toBe(true);
        const previousHead = (await destination.summary()).at;
        const scope = await destination.at();
        expect(bindingGuardDenied).toBe(true);
        const close = await inspect((store, custody) => {
          const record = store.originalDispatch("0:0", 1)!;
          const write = store.operation("0:0")!;
          const own = (seq: number) => { const row = store.stored(seq); return row ? { entry: JSON.parse(row.bytes) as Entry, hash: row.hash } : null; };
          const mint = destinationMint(store, write, 1)!;
          expect(destinationSends(store, own, write, 1)).toBe(true);
          expect(custody.live(mint.id, 1, net.clock.now)?.plaintext).toBeTruthy();
          expect([store.sending("0:0", 1)?.sent, record.consumed]).toEqual([net.clock.now, null]);
          return { closure: store.closeOriginalDispatch(record), head: store.scope()!.head };
        });
        resume();
        expect(close.closure).toMatchObject({ closed: true, callEntries: [], owner: { scope } });
        expect(close.head).toEqual(previousHead);
        // An outer pass can finish on LATE/unknown while its ask remains live.
        const physicallyCompleted = await Promise.race([completed.then(() => true), pass.then(() => portCompletions === 1)]);
        const completion = { physicallyCompleted, portCompletions, bindingGuardDenied };
        console.info("scripted original port completion before eviction", completion);
        expect(completion).toEqual({ physicallyCompleted: true, portCompletions: 1, bindingGuardDenied: true });
        await phase("original-pass", () => pass);
        expect(host.sent).toHaveLength(0); // Control must fail by actual POST count.
        const owned = await phase("closed-owner-snapshot", () => inspect((store) => store.originalDispatch("0:0", 1)));
        expect([owned?.closure, owned?.consumed]).toEqual([close.closure, null]);
        const beforeRestart = await phase("history-before-restart", () => destination.entries());
        const unknown = beforeRestart.find((entry) => entry.input.type === "outcome" && entry.input.operation === "0:0");
        expect(unknown?.input).toMatchObject({ result: "unknown", evidence: { basis: "none" } });
        // Only serializable snapshots leave this helper. Physical completion
        // is this scripted port observation, not deployment/provider drain.
        return { beforeRestart, owned };
      } finally {
        resume();
        host.beforeReceiveAdvertisement = null;
        portCompleted = null;
        console.info("executor witness phase", "helper-finally-gate-cleared", "done");
      }
    };
    const { beforeRestart, owned } = await phase("helper", runSuspendedOriginal);
    // Actual local object eviction preserves storage; this does not prove
    // drainage of a deployed release or provider exclusion.
    await phase("eviction", () => destination.restart());
    await phase("post-eviction-effect", () => (destination.stub as unknown as { effect(): Promise<number> }).effect());
    const afterRestart = await phase("post-eviction-history", () => destination.entries());
    const afterOwner = await phase("post-eviction-owner-snapshot", () => inspect((store) => store.originalDispatch("0:0", 1)));
    expect([host.sent.length, afterRestart, afterOwner]).toEqual([0, beforeRestart, owned]);
    // Local generation cannot roll back or delete the earlier closed owner.
    const current = activeContext!;
    generation = 2;
    expect(await phase("generation-check", () => inspect((store) => [store.acceptDispatchGeneration({ ...current, generation: 2, tuple: dispatchId("test-tuple", 2) }), store.acceptDispatchGeneration(current)]))).toEqual([true, false]);
    expect(await phase("final-owner-snapshot", () => inspect((store) => store.originalDispatch("0:0", 1)))).toEqual(owned);
  } finally {
    net.hold = oldHold;
    if (G) platformDispatch.delete(G.name);
    for (const name of names) platformOutside.delete(name);
  }
});
