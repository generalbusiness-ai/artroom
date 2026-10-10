import { describe, expect, onTestFinished, test } from "vitest";
import { env, runInDurableObject } from "cloudflare:test";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Digest, Entry, FactRef, Intent, OperationId, ReadRequest, ScopeId, ScopeRef, Sealed, Seed, SignedReadName } from "@generalbusiness/artroom-contract";
import { b64url, canonicalBytes, entryHash, intentDigest, retainedReadArgument, scopeIdOf, seedDigest, signIntent, signRead } from "@generalbusiness/artroom-bytes";
import { requestSession, secretSigner, sessionRequest, signedLogReader, signedReader, type Fetch } from "@generalbusiness/artroom-client";
import { timeMs, timeOf, useOf } from "@generalbusiness/artroom-derive";
import { d, keys, otherLane, t, type Actor } from "@generalbusiness/artroom-derive/testing";
import { DIRECTORY, REGISTER, platform, repositoryName } from "@generalbusiness/artroom-platform";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import { CHAIN_STEPS, Chains, rootOf } from "../src/signed-reads.ts";
import { SqliteStore } from "../src/sqlite.ts";
import { namespace } from "../src/namespace.ts";
import { mintSession, openSession, sessionsOf } from "../src/sessions.ts";
import { net } from "../src/testing.ts";
import { soon } from "./net.ts";
import { outsideOf, wired } from "./outside.ts";
import { foundingPublication } from "./publication.ts";
import { Platform, rita, routed, settle } from "./repository.ts";
import { beginSessionChild, beginSessionFixture, type SessionOwner } from "./session-settings.ts";
import { reader } from "./support.ts";
import { TEST_DEPLOYMENT, platformNet } from "./worker.ts";

const { paul, vic } = keys;
const SERVICE = "https://scopes.test";

/** A register that `who` founds by an `install` that names rita a founder, as an operator's key would. */
async function installed(who: Actor, before?: (name: ScopeId) => void, founders: readonly Actor[] = [rita]): Promise<Platform> {
  const install: Intent = { v: 1, to: null, actor: who.key, kind: "install", on: null, expected: {}, fields: { host: "git.example", namespace: "artroom", policy: "keys", founders: founders.map((f) => f.key) }, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
  const R = new Platform(scopeIdOf({ v: 1, kind: "register", definition: REGISTER, creator: null, cause: intentDigest(install), ordinal: 0 }));
  before?.(R.name);
  expect(await R.stub.found(signIntent(install, who.secret), REGISTER)).toMatchObject({ answer: "accepted" });
  return R;
}

/**
 * A register that paul installs, naming rita a founder, and rita's claim, with the repository creation answered by a STAND-IN Git
 * host (`outside.ts`): the reply to attempt 1 is lost, and attempt 2, made `delay` seconds after the claim, is confirmed. The
 * directory is created then, and its genesis creates membership, the rules scope and the destination, which are confirmed.
 */
async function founded(delay: number): Promise<{ R: Platform; D: Platform; children: Platform[] }> {
  const R = await installed(paul, (name) => wired.set(name, () => ({ outside: outsideOf(name) })));
  const found = await R.intent(rita, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", founderHandle: "@rita", recoveryKey: keys.sam.key } });
  const seed: Seed = { v: 1, kind: "directory", definition: DIRECTORY, creator: await R.at(), cause: intentDigest(found.intent), ordinal: 0 };
  const D = new Platform(scopeIdOf(seed));
  const host = outsideOf(R.name);
  host.answer("1:0" as OperationId, 1, null);
  host.answer("1:0" as OperationId, 2, { result: "confirmed", evidence: { basis: "own-answer", body: { name: repositoryName(seedDigest(seed), 2), id: "repo-1" } } });
  expect(await R.stub.submit(found, [])).toMatchObject({ answer: "accepted" });
  const driven = async () => { while ((await (R.stub as unknown as { effect(): Promise<number> }).effect()) > 0) { /* each pass may make the next one due */ } };
  await driven();
  net.clock.now = soon(delay);
  await driven();
  await settle(R, D);
  const sends = (await D.entries())[0]!.sends;
  const children = [1, 2, 3].map((n) => new Platform(scopeIdOf(sends.find((send) => send.n === n)!.to as Seed)));
  await settle(R, D, ...children);
  return { R, D, children };
}

/**
 * `who`'s claim at a register whose outside port is the STAND-IN Git host (`outside.ts`), which confirms the one attempt of its
 * creation. The directory is created, and its genesis creates membership, the rules scope and the destination, which are confirmed.
 */
async function claimedBy(R: Platform, who: Actor, handle: string): Promise<{ D: Platform; children: Platform[] }> {
  const found = await R.intent(who, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", founderHandle: handle, recoveryKey: keys.sam.key } });
  const seed: Seed = { v: 1, kind: "directory", definition: DIRECTORY, creator: await R.at(), cause: intentDigest(found.intent), ordinal: 0 };
  const D = new Platform(scopeIdOf(seed));
  const answer = await R.stub.submit(found, []);
  if (answer.answer !== "accepted") throw new Error(`the claim was not accepted: ${JSON.stringify(answer)}`);
  outsideOf(R.name).answer(`${answer.receipt.fact.seq}:0` as OperationId, 1, { result: "confirmed", evidence: { basis: "own-answer", body: { name: repositoryName(seedDigest(seed), 1), id: `repo-${answer.receipt.fact.seq}` } } });
  while ((await (R.stub as unknown as { effect(): Promise<number> }).effect()) > 0) { /* each pass may make the next one due */ }
  await settle(R, D);
  const sends = (await D.entries())[0]!.sends;
  const children = [1, 2, 3].map((n) => new Platform(scopeIdOf(sends.find((send) => send.n === n)!.to as Seed)));
  await settle(R, D, ...children);
  return { D, children };
}

/** One read over the Worker's routes, with the real read sessions as deployed under a TEST SECRET: a reader with no session and no signed read reads nothing. */
async function get(owner: SessionOwner, path: string, authorization?: string): Promise<{ status: number; body: { ok: boolean; reason?: string; value?: unknown } }> {
  return owner.required(async () => {
    const response = await routed(`${SERVICE}/v1/scopes/${path}`, authorization === undefined ? {} : { headers: { authorization } });
    return { status: response.status, body: await response.json() };
  });
}

/**
 * `who` takes the seat and first key in membership `M`, once, and asks for a read session by the client, under the TEST SECRET
 * that the caller has set. The reader is the session's `Authorization` value.
 */
async function seated(owner: SessionOwner, M: Platform, who: Actor, operation: string): Promise<string> {
  // Only the fixture's labelled reader bypasses sessions during this inspection.
  const inspection = beginSessionChild(owner, { inspector: reader });
  let at: ScopeRef;
  try {
    const entries = await M.entries();
    inspection.active();
    if (!entries.some((entry) => entry.input.type === "act" && entry.input.signed.intent.kind === "first-key")) {
      const seat = await M.did(who, "seat", { expected: await M.expected({ roster: 0 }) });
      inspection.active();
      await M.did(who, "first-key", { fields: { member: seat }, expected: await M.expected({ roster: 0, member: seat }) });
    }
    inspection.active();
    at = await M.at();
  } finally {
    inspection.close();
  }
  const issued = await owner.required(() => requestSession(SERVICE, M.name, sessionRequest(at, who.secret, soon(60), operation), { fetch: routed as unknown as Fetch }));
  if (!issued.ok) throw new Error(`no session: ${issued.reason}`);
  return issued.session.reader();
}

/** The header of one signed read by `who`, made by the client. */
const signed = (who: Actor, scope: ScopeId, read: SignedReadName, arg: string) => signedReader(secretSigner(who.secret), scope, read, arg, { now: () => Date.parse(net.clock.now) });
const seqs = (body: { value?: unknown }) => (body.value as readonly Sealed[]).map((sealed) => sealed.entry.seq);

// Invariant: a recent local signer reads the register's whole history and its carried inputs.
// Other scopes retain the bounded causal-entry policy; mismatched requests and strangers are forbidden.
// Each scope here is a real register in the namespace `PLATFORM`, under the deployed class's readers: the real read sessions,
// under a TEST SECRET. No Git host is wired: the claim's creation is recorded and nothing is sent.
describe("signed reads on real registers (the planner's decisions 61cc5e50, c6499e91, 70a0680e and ca8ad1cf)", () => {
  test("recent install and claim signers read the whole register history with no session; other reads, scopes and strangers are forbidden", async () => {
    const owner = beginSessionFixture({ secret: b64url(new Uint8Array(32).fill(9)), sessions: false, inspector: null });
    onTestFinished(owner.close);
    net.hold = net.deaf = null;
    const R = await installed(paul);
    const found = await R.intent(rita, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", founderHandle: "@rita", recoveryKey: keys.sam.key } });
    expect(await R.stub.submit(found, [])).toMatchObject({ answer: "accepted", receipt: { fact: { seq: 1 } } });

    // Control: the same reads with no header at all are forbidden, as the deployed class answers a reader with no session.
    expect([(await get(owner, R.name)).status, (await get(owner, `${R.name}/history`)).status]).toEqual([403, 403]);
    // The recent install signer reads the whole register, including another key's claim.
    const summary = await get(owner, R.name, await signed(paul, R.name, "summary", "summary"));
    expect([summary.status, (summary.body.value as { scope: { kind: string } }).scope.kind]).toEqual([200, "register"]);
    const mine = await get(owner, `${R.name}/history`, await signed(paul, R.name, "history", "0"));
    expect([mine.status, seqs(mine.body)]).toEqual([200, [0, 1]]);
    expect((await get(owner, `${R.name}/entries/0`, await signed(paul, R.name, "entry", "0"))).status).toBe(200);
    // The recent claim signer has the same whole-history authority.
    const claims = await get(owner, `${R.name}/history`, await signed(rita, R.name, "history", "0"));
    expect([claims.status, seqs(claims.body)]).toEqual([200, [0, 1]]);
    expect([(await get(owner, `${R.name}/entries/1`, await signed(rita, R.name, "entry", "1"))).status, (await get(owner, `${R.name}/entries/1`, await signed(paul, R.name, "entry", "1"))).status]).toEqual([200, 200]);

    // Every other read, and a read under a signature of another read or argument, is forbidden.
    expect([
      (await get(owner, `${R.name}/items/claim`, await signed(paul, R.name, "summary", "summary"))).status,
      (await get(owner, `${R.name}/outbox`, await signed(paul, R.name, "summary", "summary"))).status,
      (await get(owner, `${R.name}/entries/1`, await signed(rita, R.name, "entry", "0"))).status,
      (await get(owner, R.name, await signed(paul, R.name, "history", "0"))).status,
    ]).toEqual([403, 403, 403, 403]);
    // Another scope: a register that vic installed. Paul signed nothing there, and a signature for R is not one for it.
    const S = await installed(vic);
    expect([(await get(owner, S.name, await signed(paul, S.name, "summary", "summary"))).status, (await get(owner, S.name, await signed(paul, R.name, "summary", "summary"))).status, (await get(owner, S.name, await signed(vic, S.name, "summary", "summary"))).status]).toEqual([403, 403, 200]);
    // A second register that paul installed: he may read it, and his signature for R is still not one for it.
    const P = await installed(paul);
    expect([(await get(owner, P.name, await signed(paul, R.name, "summary", "summary"))).status, (await get(owner, P.name, await signed(paul, P.name, "summary", "summary"))).status]).toEqual([403, 200]);
    // A key that signed nothing in R; and a request that names paul's key and is signed by vic's.
    expect((await get(owner, R.name, await signed(vic, R.name, "summary", "summary"))).body).toEqual({ ok: false, reason: "forbidden" });
    const forged = signRead({ v: 1, to: R.name, actor: paul.key, read: "summary", arg: "summary", notAfter: soon(60) }, vic.secret);
    expect((await get(owner, R.name, `Signed ${b64url(canonicalBytes(forged))}`)).status).toBe(403);

    // Whole register replay by the install signer is contiguous through its head.
    const required = owner.acquireRequired();
    try {
      const { report, why } = await verify(httpSource(SERVICE, { fetch: routed, reader: signedLogReader(secretSigner(paul.secret), { now: () => Date.parse(net.clock.now) }) }), { mode: "replay", scope: R.name, platform, grants: "proven" });
      expect([report.result, report.coverage.map((c) => [c.scope.scope, c.from, c.through]), why]).toEqual(["consistent", [[R.name, 0, 1]], null]);
    } finally {
      required.close();
    }
  });

  test("a signed read is refused past its notAfter, with a notAfter further ahead than an intent may live, and once the key's last entry is older than the window", async () => {
    const owner = beginSessionFixture({ secret: b64url(new Uint8Array(32).fill(9)), sessions: false, inspector: null });
    onTestFinished(owner.close);
    net.hold = net.deaf = null;
    const R = await installed(paul);
    const late = await signed(paul, R.name, "summary", "summary");
    // Ahead by one second more than an intent may live: signed with the bytes package, since the client signs no such read.
    const far: ReadRequest = { v: 1, to: R.name, actor: paul.key, read: "summary", arg: "summary", notAfter: soon(PROPOSED_BOUNDS.intentLifetimeSeconds + 1) };
    const farthest = `Signed ${b64url(canonicalBytes(signRead(far, paul.secret)))}`;
    const edge = `Signed ${b64url(canonicalBytes(signRead({ ...far, notAfter: soon(PROPOSED_BOUNDS.intentLifetimeSeconds) }, paul.secret)))}`;
    expect([(await get(owner, R.name, farthest)).status, (await get(owner, R.name, edge)).status, (await get(owner, R.name, late)).status]).toEqual([403, 200, 200]);
    // Rita claims ten minutes after the install.
    net.clock.now = soon(600);
    expect(await R.stub.submit(await R.intent(rita, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", founderHandle: "@rita", recoveryKey: keys.sam.key } }), [])).toMatchObject({ answer: "accepted" });
    // The read signed before is past its notAfter.
    expect((await get(owner, R.name, late)).status).toBe(403);
    // Six minutes later the install is older than the window, and the claim is not: paul is refused, and rita reads.
    net.clock.now = soon(360);
    expect([(await get(owner, R.name, await signed(paul, R.name, "summary", "summary"))).status, (await get(owner, R.name, await signed(rita, R.name, "summary", "summary"))).status]).toEqual([403, 200]);
  });

  test("the claim's key reads the summary, the genesis and every entry of the directory the claim caused, and of membership, the rules scope and the destination that the directory caused, with no session; the install's key, which signed no claim, reads none of them", async () => {
    const owner = beginSessionFixture({ secret: b64url(new Uint8Array(32).fill(9)), sessions: false, inspector: null });
    onTestFinished(owner.close);
    net.hold = net.deaf = null;
    const { D, children } = await founded(PROPOSED_BOUNDS.dispatchRetrySeconds);
    const [M, Ru, G] = children as [Platform, Platform, Platform];
    expect(await Promise.all(children.map(async (node) => (await node.summary()).value.scope.kind))).toEqual(["membership", "rules", "destination"]);
    // A cold child needs an ancestor from the real namespace to find its
    // root. Invalid requests must fail before making any resolver call.
    const calls: FactRef[] = [];
    const resolver = namespace(env.PLATFORM).resolver;
    wired.set(M.name, () => ({ transport: null, resolver: { read: (fact, seconds) => { calls.push(fact); return resolver.read(fact, seconds); } } }));
    await M.restart();
    const request: ReadRequest = { v: 1, to: M.name, actor: rita.key, read: "summary", arg: "summary", notAfter: soon(60) };
    const header = (request: ReadRequest, secret = rita.secret) => `Signed ${b64url(canonicalBytes(signRead(request, secret)))}`;
    expect([
      (await get(owner, M.name, "Signed not-a-read")).status,
      (await get(owner, M.name, header(request, paul.secret))).status,
      (await get(owner, M.name, header({ ...request, to: D.name }))).status,
      (await get(owner, `${M.name}/entries/0`, header({ ...request, read: "entry", arg: "1" }))).status,
      (await get(owner, M.name, header({ ...request, notAfter: net.clock.now }))).status,
      (await get(owner, M.name, header({ ...request, notAfter: soon(PROPOSED_BOUNDS.intentLifetimeSeconds + 1) }))).status,
      calls,
    ]).toEqual([403, 403, 403, 403, 403, 403, []]);
    const now = net.clock.now;
    try {
      net.clock.now = timeOf(timeMs(now)! - 1000);
      expect([(await get(owner, M.name, await signed(rita, M.name, "summary", "summary"))).status, calls]).toEqual([503, []]);
    } finally { net.clock.now = now; }
    // For each of the four scopes: the summary, the genesis, and a history that holds every entry, each of whose chains leads to the claim.
    const reads = async (who: Actor, node: Platform) => {
      const history = await get(owner, `${node.name}/history`, await signed(who, node.name, "history", "0"));
      return [(await get(owner, node.name, await signed(who, node.name, "summary", "summary"))).status, (await get(owner, `${node.name}/entries/0`, await signed(who, node.name, "entry", "0"))).status, history.status, history.status === 200 ? seqs(history.body) : null];
    };
    const all = await Promise.all([D, M, Ru, G].map(async (node) => (await node.entries()).map((entry) => entry.seq)));
    expect(await Promise.all([D, M, Ru, G].map((node) => reads(rita, node)))).toEqual(all.map((seqs) => [200, 200, 200, seqs]));
    expect(all.every((seqs) => seqs.length > 1)).toBe(true);
    expect(calls.length).toBeGreaterThan(0); // positive control: the valid chain read reaches the real ancestor
    // Control: the same reads with no header, and by the install's key, are forbidden.
    expect(await Promise.all([D, M, Ru, G].map(async (node) => [(await get(owner, node.name)).status, ...(await reads(paul, node))]))).toEqual([D, M, Ru, G].map(() => [403, 403, 403, 403, null]));
    // A recent local signer needs no chain, even after restart. Keep the
    // child's dispatcher off so only read authorization can call resolver.
    expect(await M.act(rita, "seat", { expected: await M.expected({ roster: 0 }) })).toMatchObject({ answer: "accepted" });
    await M.restart();
    calls.length = 0;
    expect([(await get(owner, M.name, await signed(rita, M.name, "summary", "summary"))).status, calls]).toEqual([200, []]);
  });

  test("the window of a read by the cause chain is measured at the root entry: the claim, not the genesis that the claim caused", async () => {
    const owner = beginSessionFixture({ secret: b64url(new Uint8Array(32).fill(9)), sessions: false, inspector: null });
    onTestFinished(owner.close);
    net.hold = net.deaf = null;
    const claimed = net.clock.now;
    // The directory and its children are created ten minutes after the claim.
    const { D, children } = await founded(600);
    const M = children[0]!;
    const at = (seconds: number) => { net.clock.now = timeOf(timeMs(claimed)! + seconds * 1000); };
    const both = async () => [(await get(owner, D.name, await signed(rita, D.name, "summary", "summary"))).status, (await get(owner, M.name, await signed(rita, M.name, "summary", "summary"))).status];
    // Fourteen minutes after the claim, it is within the window: rita reads both.
    at(840);
    expect(await both()).toEqual([200, 200]);
    // Sixteen minutes after the claim, it is older than the window, and the geneses are six minutes old: both are forbidden.
    at(960);
    expect(await both()).toEqual([403, 403]);
  });

  // Invariant: recent register signers read every claim and its actual
  // carried inputs. Child scopes retain causal restrictions. Real scopes
  // with two founders; only the Git creation replies are stand-ins.
  test("multiple cofounders and the install signer read every claim and carried input of the register; register and own-directory replay are contiguous and consistent", async () => {
    const owner = beginSessionFixture({ secret: b64url(new Uint8Array(32).fill(9)), sessions: false, inspector: null });
    onTestFinished(owner.close);
    net.hold = net.deaf = null;
    const R = await installed(paul, (name) => wired.set(name, () => ({ outside: outsideOf(name) })), [rita, vic]);
    const { D } = await claimedBy(R, rita, "@rita");
    const { D: V } = await claimedBy(R, vic, "@vic");
    const entries = await R.entries();
    // The register's history: the install, rita's claim, its outcome and the record of her directory; then the same three of vic's.
    expect(entries.map((entry) => entry.input.type)).toEqual(["genesis", "act", "outcome", "delivery", "act", "outcome", "delivery"]);
    const history = async (who: Actor, node: Platform) => seqs((await get(owner, `${node.name}/history`, await signed(who, node.name, "history", "0"))).body);
    expect([await history(rita, R), await history(vic, R), await history(paul, R)]).toEqual(Array.from({ length: 3 }, () => [0, 1, 2, 3, 4, 5, 6]));
    const entry = async (who: Actor, seq: number) => (await get(owner, `${R.name}/entries/${seq}`, await signed(who, R.name, "entry", String(seq)))).status;
    expect([await entry(rita, 2), await entry(vic, 2), await entry(paul, 2), await entry(vic, 5), await entry(rita, 5)]).toEqual([200, 200, 200, 200, 200]);

    // Retained inputs: the register's record of each directory retains that directory's genesis, and rita's directory's genesis
    // retains her claim and its outcome. Register cofounders read both claim
    // inputs, while authority over the separate directories stays causal.
    const retained = async (who: Actor, node: Platform, digest: string) => (await get(owner, `${node.name}/retained/entry/${encodeURIComponent(digest)}`, await signed(who, node.name, "retained", retainedReadArgument("entry", digest as Digest)))).status;
    const [ritas, vics] = [entries[3]!.uses[0]!.content, entries[6]!.uses[0]!.content];
    expect([await retained(rita, R, ritas), await retained(vic, R, ritas), await retained(paul, R, ritas), await retained(vic, R, vics)]).toEqual([200, 200, 200, 200]);
    const resourceHeader = await signed(rita, R.name, "retained", retainedReadArgument("entry", ritas));
    expect([
      (await get(owner, `${R.name}/retained/entry/${encodeURIComponent(ritas)}`, resourceHeader)).status,
      (await get(owner, `${R.name}/retained/value/${encodeURIComponent(ritas)}?domain=other`, resourceHeader)).status,
      (await get(owner, `${R.name}/retained/entry/${encodeURIComponent(ritas)}?domain=other`, resourceHeader)).status,
      (await get(owner, `${R.name}/retained/entry/${encodeURIComponent(ritas)}`, await signed(rita, R.name, "retained", ritas))).status,
    ]).toEqual([200, 403, 403, 403]);
    const genesis = (await D.entries())[0]!;
    expect(genesis.uses.map((use) => use.fact.seq).sort()).toEqual([1, 2]);
    expect(await Promise.all(genesis.uses.map((use) => retained(rita, D, use.content)))).toEqual([200, 200]);
    expect(await Promise.all(genesis.uses.map((use) => retained(vic, D, use.content)))).toEqual([403, 403]);
    // Vic's own directory retains his claim, not rita's.
    expect(await retained(vic, V, genesis.uses[0]!.content)).toBe(403);

    // The replay of rita's directory by her signed reads of the log and of its retained inputs: every entry, every input.
    const required = owner.acquireRequired();
    try {
      const { report, why } = await verify(httpSource(SERVICE, { fetch: routed, reader: signedLogReader(secretSigner(rita.secret), { now: () => Date.parse(net.clock.now) }) }), { mode: "replay", scope: D.name, platform, grants: "proven" });
      expect([report.result, why]).toEqual(["consistent", null]);
      // Whole register access does not grant another directory's history.
      // Anchor exactly the foreign genesis facts this fixture has observed;
      // replay states that trust separately from its contiguous local coverage.
      const unanchored = await verify(httpSource(SERVICE, { fetch: routed, reader: signedLogReader(secretSigner(vic.secret), { now: () => Date.parse(net.clock.now) }) }), { mode: "replay", scope: R.name, platform, grants: "proven" });
      expect([unanchored.report.result, unanchored.report.coverage.map((c) => [c.scope.scope, c.from, c.through]), unanchored.why]).toEqual(["missing-dependency", [[R.name, 0, 2]], `the history of the source scope ${D.name} cannot be read, and no anchor names its entry 0`]);
      const anchors = [entries[3]!, entries[6]!].flatMap((entry) => entry.uses.map((use) => ({ scope: use.fact.at.scope, seq: use.fact.seq, hash: use.fact.hash })));
      const register = await verify(httpSource(SERVICE, { fetch: routed, reader: signedLogReader(secretSigner(vic.secret), { now: () => Date.parse(net.clock.now) }) }), { mode: "replay", scope: R.name, platform, grants: "proven", anchors });
      expect([register.report.result, register.report.coverage.map((c) => [c.scope.scope, c.from, c.through]), register.why]).toEqual(["consistent", [[R.name, 0, 6]], null]);
    } finally {
      required.close();
    }
  });

  // A foreign send's signer qualifies by the delivery's root, even with no
  // local signed entry or genesis-root authority in the receiving directory.
  // Real platform rules/scopes; only the Git creation reply is a stand-in.
  test("a foreign recovery-key send gives its signer the directory delivery and typed retained source, while unrelated readers and scope summary remain forbidden; unavailable old roots do not block independent local roots", async () => {
    const owner = beginSessionFixture({ secret: b64url(new Uint8Array(32).fill(9)), sessions: false, inspector: null });
    onTestFinished(owner.close);
    net.hold = net.deaf = null;
    const R = await installed(paul, (name) => wired.set(name, () => ({ outside: outsideOf(name) })));
    const { D, children } = await claimedBy(R, rita, "@rita");
    const M = children[0]!;
    const seat = await M.did(rita, "seat", { expected: await M.expected({ roster: 0 }) });
    const key = await M.did(rita, "first-key", { fields: { member: seat }, expected: await M.expected({ roster: 0, member: seat }) });
    // Real local rows are resolved even when the ancestry reader scripts an
    // unavailable answer. Resolved rows are not looked up on the next update.
    const independent = await runInDurableObject(M.object, async (_instance, state) => {
      const store = new SqliteStore({ exec: (q, ...args) => state.storage.sql.exec(q, ...args), transaction: (f) => state.storage.transactionSync(f) });
      const looked: number[] = [];
      const chains = new Chains({ scope: () => store.scope(), stored: (seq) => { looked.push(seq); return store.stored(seq); } }, async () => null);
      await chains.update();
      const root = chains.at(key);
      looked.length = 0;
      await chains.update();
      return { unavailable: chains.at(0) === undefined, root, revisited: looked.includes(key) };
    });
    expect(independent).toMatchObject({ unavailable: true, root: { actor: rita.key, scope: M.name, seq: key }, revisited: false });
    const I = await M.created(seat);
    await settle(M, I);
    const inboxRecord = (await M.entries()).find((entry) => entry.input.type === "delivery" && entry.input.from.at.scope === I.name)!;
    const unrelated = inboxRecord.uses.find((use) => use.fact.at.scope === I.name)!.content;
    const revoked = await M.did(keys.sam, "revoke-key", { idempotencyKey: unrelated, on: key, fields: { as: "compromised" }, expected: await M.expected({ on: key, roster: 0, member: seat }) });
    await settle(M, D);
    const delivery = (await D.entries()).find((entry) => entry.input.type === "delivery" && entry.input.from.at.scope === M.name && entry.input.from.seq === revoked)!;
    expect(delivery.input.type).toBe("delivery");
    const read = async (who: Actor) => get(owner, `${D.name}/entries/${delivery.seq}`, await signed(who, D.name, "entry", String(delivery.seq)));
    expect([(await read(keys.sam)).status, (await read(vic)).status, (await get(owner, D.name, await signed(keys.sam, D.name, "summary", "summary"))).status, (await get(owner, `${D.name}/entries/0`, await signed(keys.sam, D.name, "entry", "0"))).status]).toEqual([200, 403, 403, 403]);
    const kept = delivery.uses.find((use) => use.fact.at.scope === M.name && use.fact.seq === revoked)!.content;
    expect((await get(owner, `${D.name}/retained/entry/${encodeURIComponent(kept)}`, await signed(keys.sam, D.name, "retained", retainedReadArgument("entry", kept)))).status).toBe(200);
    // Sam's valid entry names the known inbox digest only as ordinary
    // idempotency text. It grants no authority over Rita's retained input.
    expect((await get(owner, `${M.name}/retained/entry/${encodeURIComponent(unrelated)}`, await signed(keys.sam, M.name, "retained", retainedReadArgument("entry", unrelated)))).status).toBe(403);
    const acknowledgement = (await D.entries()).find((entry) => entry.input.type === "delivery" && entry.input.message.class === "result" && entry.input.message.of.from.at.scope === D.name && entry.input.message.of.from.seq === delivery.seq)!;
    const history = await get(owner, `${D.name}/history`, await signed(keys.sam, D.name, "history", "0"));
    expect([history.status, seqs(history.body)]).toEqual([200, [delivery.seq, acknowledgement.seq]]);
    expect((await get(owner, `${D.name}/history`, await signed(vic, D.name, "history", "0"))).status).toBe(403);
  });

  // Invariant: a created membership's authenticated session reads the whole
  // register history and carried inputs without a signed-entry window.
  test("a created membership session reads every founder's claim and carried inputs after the signed-entry window, while register summary/items remain forbidden", async () => {
    const owner = beginSessionFixture({ secret: b64url(new Uint8Array(32).fill(9)), sessions: false, inspector: null });
    onTestFinished(owner.close);
    net.hold = net.deaf = null;
    const R = await installed(paul, (name) => wired.set(name, () => ({ outside: outsideOf(name) })), [rita, vic]);
    const { children } = await claimedBy(R, rita, "@rita");
    await claimedBy(R, vic, "@vic");
    const M = children[0]!;
    // Rita takes her seat and her first key, and asks membership for a session, under a TEST SECRET.
    const seat = await M.did(rita, "seat", { expected: await M.expected({ roster: 0 }) });
    await M.did(rita, "first-key", { fields: { member: seat }, expected: await M.expected({ roster: 0, member: seat }) });
    const [at, entries] = [await M.at(), await R.entries()];
    net.clock.now = soon(PROPOSED_BOUNDS.intentLifetimeSeconds + 1);
    expect((await get(owner, `${R.name}/history`, await signed(rita, R.name, "history", "0"))).status).toBe(403);
    const required = owner.acquireRequired();
    try {
      const issued = await requestSession(SERVICE, M.name, sessionRequest(at, rita.secret, soon(60), "chained"), { fetch: routed as unknown as Fetch });
      if (!issued.ok) throw new Error(`no session: ${issued.reason}`);
      const session = issued.session.reader();
      const read = async (path: string, as: string | null = session) => {
        owner.active();
        const response = await routed(`${SERVICE}/v1/scopes/${R.name}${path}`, as === null ? {} : { headers: { authorization: as } });
        return { status: response.status, body: await response.json() as { value?: unknown } };
      };
      const history = await read("/history");
      expect([history.status, seqs(history.body)]).toEqual([200, [0, 1, 2, 3, 4, 5, 6]]);
      expect([(await read("/entries/2")).status, (await read("/entries/5")).status, (await read(`/retained/entry/${encodeURIComponent(entries[3]!.uses[0]!.content)}`)).status, (await read(`/retained/entry/${encodeURIComponent(entries[6]!.uses[0]!.content)}`)).status]).toEqual([200, 200, 200, 200]);
      // The register's summary and its items are no entries: forbidden. With no session, the history is forbidden too.
      expect([(await read("")).status, (await read("/items/claim")).status, (await read("/history", null)).status]).toEqual([403, 403, 403]);
    } finally {
      required.close();
    }
  });

  // Invariant: a session of a room's membership reads that room's destination, rules scope and directory whole, as membership itself:
  // the summary, the items, every entry, those that no member signed among them, and the retained inputs (decision ca8ad1cf). The
  // scope resolves its exact membership incarnation from its actual directory before any retained observation. A session of another room's
  // membership reads none of it, and a key with no session keeps the signed-read rule.
  // On real scopes: two rooms founded on one register, with the STAND-IN Git host of `outside.ts` for the register and for rita's
  // destination's founding publication (`publication.ts`).
  test("after the founding publication, a session of the room's membership reads the destination's whole history, its host outcomes and receipt among them, its summary, its branch item and receipt item, and the rules scope and the directory whole; a session of another room's membership is refused there; the founder's key with no session is refused once its window has passed", async () => {
    const owner = beginSessionFixture({ secret: b64url(new Uint8Array(32).fill(9)), sessions: false, inspector: null });
    onTestFinished(owner.close);
    net.hold = net.deaf = null;
    const claimed = net.clock.now;
    const R = await installed(paul, (name) => wired.set(name, () => ({ outside: outsideOf(name) })), [rita, vic]);
    const { D, children } = await claimedBy(R, rita, "@rita");
    const { children: vics } = await claimedBy(R, vic, "@vic");
    const [M, Ru, G] = children as [Platform, Platform, Platform];
    await foundingPublication(G);
    const entries = await G.entries();
    // The publication wrote the host's outcomes, the receipt's among them: entries that no member signed. The branch is ready.
    expect((await G.item(0)).state).toBe("ready");
    expect(entries.map((entry) => (entry.input.type === "outcome" ? entry.input.kind : entry.input.type))).toEqual(["genesis", "delivery", "mint", "first-head", "mint", "receipt", "revoke", "revoke"]);
    const held = new Map(await Promise.all([Ru, D].map(async (node) => [node.name, (await node.entries()).map((entry) => entry.seq)] as const)));
    const required = owner.acquireRequired();
    try {
      const session = await seated(owner, M, rita, "room");
      const theirs = await seated(owner, vics[0]!, vic, "theirs");
      const read = async (node: Platform, path: string, as: string | null) => {
        owner.active();
        const response = await routed(`${SERVICE}/v1/scopes/${node.name}${path}`, as === null ? {} : { headers: { authorization: as } });
        return { status: response.status, body: await response.json() as { value?: unknown } };
      };
      const history = await read(G, "/history", session);
      expect([history.status, history.status === 200 ? seqs(history.body) : null]).toEqual([200, entries.map((entry) => entry.seq)]);
      const summary = await read(G, "", session);
      const items = summary.body.value as { items: { type: string; state: string }[] };
      expect([summary.status, items.items.find((item) => item.type === "branch")?.state]).toEqual([200, "ready"]);
      const receipts = await read(G, "/items/receipt", session);
      expect([receipts.status, (receipts.body.value as unknown[]).length > 0]).toEqual([200, true]);
      expect((await read(G, `/entries/${entries.at(-1)!.seq}`, session)).status).toBe(200);
      const retained = entries.flatMap((entry) => entry.uses.map((use) => use.content));
      expect(await Promise.all(retained.slice(0, 2).map(async (digest) => (await read(G, `/retained/entry/${encodeURIComponent(digest)}`, session)).status))).toEqual(retained.slice(0, 2).map(() => 200));
      // The rules scope and the directory: whole, though no entry of the rules scope retains an observation of membership yet.
      for (const node of [Ru, D]) {
        const whole = await read(node, "/history", session);
        expect([node.name, whole.status, seqs(whole.body), (await read(node, "", session)).status]).toEqual([node.name, 200, held.get(node.name), 200]);
      }
      // Vic's session is of another room: refused at each of rita's scopes, and it reads its own destination.
      expect([(await read(G, "/history", theirs)).status, (await read(G, "", theirs)).status, (await read(Ru, "", theirs)).status, (await read(D, "", theirs)).status, (await read(vics[2]!, "/history", theirs)).status]).toEqual([403, 403, 403, 403, 200]);
      // The birth resolution requires the full confirmed membership incarnation even before a local observation.
      const sessions = sessionsOf(platformNet.secret, TEST_DEPLOYMENT)!;
      const claims = openSession(sessions, session.slice("Session ".length))!;
      const another = `Session ${mintSession(sessions, { ...claims, membership: { ...claims.membership, inc: `in_${claims.membership.inc[3] === "a" ? "b" : "a"}${claims.membership.inc.slice(4)}` as never } })}`;
      expect([(await read(D, "", another)).status, (await read(G, "", another)).status]).toEqual([403, 403]);
      // Rita's key with no session keeps the signed-read rule: past the window of her claim she reads nothing of the destination,
      // and her session still reads it whole.
      net.clock.now = timeOf(timeMs(claimed)! + (PROPOSED_BOUNDS.intentLifetimeSeconds + 60) * 1000);
      const late = await seated(owner, M, rita, "late");
      let signedStatus: number;
      signedStatus = (await get(owner, `${G.name}/history`, await signed(rita, G.name, "history", "0"))).status;
      expect([signedStatus, (await read(G, "/history", late)).status]).toEqual([403, 200]);
    } finally {
      required.close();
    }
  });

  // Made by hand: a chain of geneses, each the creation of the one before, from rita's act, an outcome of that act's operation, and
  // deliveries from the geneses. No scope judged them. It shows the bound of `rootOf`, which no real chain passes: the longest of the
  // platform's founding is four causes, from an entry of membership that the directory's confirmation wrote to the claim.
  test("a cause chain is followed through at most four causes: a genesis four creations from the signed act has its root, one five creations away has none; an outcome leads to the act that opened its operation, in its own scope only; a delivery leads to the entry that sent it, within the same bound; an entry that cannot be read is unavailable, and a cause that names no source has no root", async () => {
    const act: Entry = { v: 1, at: otherLane, seq: 1, prev: d("0"), time: t(0), clamped: false, epoch: 0, input: { type: "act", signed: signIntent({ v: 1, to: otherLane, actor: rita.key, kind: "split", on: null, expected: {}, fields: {}, idempotencyKey: "split", notAfter: t(60) }, rita.secret), authority: [], presented: {} }, uses: [], prepared: [], effects: [], sends: [] };
    const fact = (entry: Entry): FactRef => ({ at: entry.at, seq: entry.seq, hash: entryHash(entry) });
    const kept = new Map<string, Entry>([[useOf(fact(act), act).content, act]]);
    const chain: Entry[] = [];
    let source = act;
    for (let n = 1; n <= CHAIN_STEPS + 1; n++) {
      const seed: Seed = { v: 1, kind: "lane", definition: d("e"), creator: source.at, cause: source.input.type === "genesis" ? seedDigest(source.input.seed) : intentDigest((source.input as { signed: { intent: Intent } }).signed.intent), ordinal: 0 };
      const at: ScopeRef = { ...otherLane, scope: scopeIdOf(seed) };
      const genesis: Entry = { v: 1, at, seq: 0, prev: null, time: t(n), clamped: false, epoch: 0, input: { type: "genesis", seed, inc: otherLane.inc, kind: "open", founding: null, source: fact(source), n: 0, message: { class: "request", type: "create", body: {} }, decision: "applied" }, uses: [useOf(fact(source), source)], prepared: [], effects: [], sends: [] };
      kept.set(useOf(fact(genesis), genesis).content, genesis);
      chain.push(genesis);
      source = genesis;
    }
    const read = async (use: { content: string }) => kept.get(use.content) ?? null;
    const root = { actor: rita.key, time: t(0), scope: act.at.scope, seq: act.seq };
    expect([await rootOf(chain[0]!, read), await rootOf(chain[CHAIN_STEPS - 1]!, read), await rootOf(chain[CHAIN_STEPS]!, read)]).toEqual([root, root, null]);
    // Control: the same chain under a bound one longer has its root. An entry of the chain that cannot be read now; and a genesis whose
    // source is a genesis that its seed's cause does not name.
    const stray: Entry = { ...chain[1]!, input: { ...(chain[1]!.input as Extract<Entry["input"], { type: "genesis" }>), seed: { ...(chain[1]!.input as Extract<Entry["input"], { type: "genesis" }>).seed, cause: d("c") } } };
    expect([await rootOf(chain[CHAIN_STEPS]!, read, CHAIN_STEPS + 1), await rootOf(chain[1]!, async (use) => (use.content === useOf(fact(act), act).content ? null : read(use))), await rootOf(stray, read)]).toEqual([root, "unavailable", null]);

    // An outcome of the operation that the act opened, in the act's scope: one cause, read from that scope's own entries. The same
    // outcome read as another scope's entry ends the chain.
    const outcome: Entry = { ...act, seq: 2, prev: d("1"), input: { type: "outcome", operation: "1:0" as OperationId, attempt: 1, owner: REGISTER, kind: "create-repository", result: "confirmed", evidence: { basis: "own-answer", body: {} } } };
    const own = { scope: otherLane.scope, entry: (seq: number) => (seq === 1 ? act : null) };
    expect([await rootOf(outcome, read, CHAIN_STEPS, own), await rootOf(outcome, read, CHAIN_STEPS, { ...own, scope: chain[0]!.at.scope }), await rootOf(outcome, read)]).toEqual([root, null, null]);
    // A delivery from a genesis three creations away is four causes from the act; one from a genesis four creations away is five.
    const delivery = (from: Entry): Entry => ({ ...act, seq: 3, prev: d("2"), input: { type: "delivery", from: fact(from), n: 0, message: { class: "control", type: "confirm", genesis: fact(from) } }, uses: [useOf(fact(from), from)] });
    expect([await rootOf(delivery(chain[CHAIN_STEPS - 2]!), read), await rootOf(delivery(chain[CHAIN_STEPS - 1]!), read)]).toEqual([root, null]);
  });
});
