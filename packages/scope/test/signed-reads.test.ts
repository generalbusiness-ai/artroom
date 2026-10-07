import { describe, expect, test } from "vitest";
import { env } from "cloudflare:test";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Entry, FactRef, Intent, OperationId, ReadRequest, ScopeId, ScopeRef, Sealed, Seed, SignedReadName } from "@generalbusiness/artroom-contract";
import { b64url, canonicalBytes, entryHash, intentDigest, scopeIdOf, seedDigest, signIntent, signRead } from "@generalbusiness/artroom-bytes";
import { secretSigner, signedLogReader, signedReader } from "@generalbusiness/artroom-client";
import { timeMs, timeOf, useOf } from "@generalbusiness/artroom-derive";
import { d, keys, otherLane, t, type Actor } from "@generalbusiness/artroom-derive/testing";
import { DIRECTORY, REGISTER, platform, repositoryName } from "@generalbusiness/artroom-platform";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import { CHAIN_STEPS, rootOf } from "../src/signed-reads.ts";
import { namespace } from "../src/namespace.ts";
import { net } from "../src/testing.ts";
import { soon } from "./net.ts";
import { outsideOf, wired } from "./outside.ts";
import { Platform, rita, routed, settle } from "./repository.ts";
import { platformNet } from "./worker.ts";

const { paul, vic } = keys;
const SERVICE = "https://scopes.test";

/** A register that `who` founds by an `install` that names rita a founder, as an operator's key would. */
async function installed(who: Actor, before?: (name: ScopeId) => void): Promise<Platform> {
  const install: Intent = { v: 1, to: null, actor: who.key, kind: "install", on: null, expected: {}, fields: { host: "git.example", namespace: "artroom", policy: "keys", founders: [rita.key] }, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
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

/** One read over the Worker's routes, with the real read sessions as deployed under a TEST SECRET: a reader with no session and no signed read reads nothing. */
async function get(path: string, authorization?: string): Promise<{ status: number; body: { ok: boolean; reason?: string; value?: unknown } }> {
  platformNet.sessions = true;
  platformNet.secret = b64url(new Uint8Array(32).fill(9));
  try {
    const response = await routed(`${SERVICE}/v1/scopes/${path}`, authorization === undefined ? {} : { headers: { authorization } });
    return { status: response.status, body: await response.json() };
  } finally {
    platformNet.sessions = false;
    platformNet.secret = null;
  }
}

/** The header of one signed read by `who`, made by the client. */
const signed = (who: Actor, scope: ScopeId, read: SignedReadName, arg: string) => signedReader(secretSigner(who.secret), scope, read, arg, { now: () => Date.parse(net.clock.now) });
const seqs = (body: { value?: unknown }) => (body.value as readonly Sealed[]).map((sealed) => sealed.entry.seq);

// Invariant: with no session, a scope answers a signed read only to a key that signed one of its entries within the intent window,
// and only its summary, its genesis and that key's own entries. Every other read, scope, key and time is `forbidden`.
// Each scope here is a real register in the namespace `PLATFORM`, under the deployed class's readers: the real read sessions,
// under a TEST SECRET. No Git host is wired: the claim's creation is recorded and nothing is sent.
describe("signed reads on real registers (the planner's decisions 61cc5e50, c6499e91 and 70a0680e)", () => {
  test("the install's key reads the register's summary, genesis and own entries with no session; a founder's claim key reads its own; every other read, another scope and a key that signed nothing are forbidden", async () => {
    net.hold = net.deaf = null;
    const R = await installed(paul);
    const found = await R.intent(rita, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", founderHandle: "@rita", recoveryKey: keys.sam.key } });
    expect(await R.stub.submit(found, [])).toMatchObject({ answer: "accepted", receipt: { fact: { seq: 1 } } });

    // Control: the same reads with no header at all are forbidden, as the deployed class answers a reader with no session.
    expect([(await get(R.name)).status, (await get(`${R.name}/history`)).status]).toEqual([403, 403]);
    // The install's key: the summary, and a history that holds the genesis and nothing that another key signed.
    const summary = await get(R.name, await signed(paul, R.name, "summary", "summary"));
    expect([summary.status, (summary.body.value as { scope: { kind: string } }).scope.kind]).toEqual([200, "register"]);
    const mine = await get(`${R.name}/history`, await signed(paul, R.name, "history", "0"));
    expect([mine.status, seqs(mine.body)]).toEqual([200, [0]]);
    expect((await get(`${R.name}/entries/0`, await signed(paul, R.name, "entry", "0"))).status).toBe(200);
    // The founder's claim key: the genesis and its own claim. The install's key may not read the claim's entry.
    const claims = await get(`${R.name}/history`, await signed(rita, R.name, "history", "0"));
    expect([claims.status, seqs(claims.body)]).toEqual([200, [0, 1]]);
    expect([(await get(`${R.name}/entries/1`, await signed(rita, R.name, "entry", "1"))).status, (await get(`${R.name}/entries/1`, await signed(paul, R.name, "entry", "1"))).body]).toEqual([200, { ok: false, reason: "forbidden" }]);

    // Every other read, and a read under a signature of another read or argument, is forbidden.
    expect([
      (await get(`${R.name}/items/claim`, await signed(paul, R.name, "summary", "summary"))).status,
      (await get(`${R.name}/outbox`, await signed(paul, R.name, "summary", "summary"))).status,
      (await get(`${R.name}/entries/1`, await signed(rita, R.name, "entry", "0"))).status,
      (await get(R.name, await signed(paul, R.name, "history", "0"))).status,
    ]).toEqual([403, 403, 403, 403]);
    // Another scope: a register that vic installed. Paul signed nothing there, and a signature for R is not one for it.
    const S = await installed(vic);
    expect([(await get(S.name, await signed(paul, S.name, "summary", "summary"))).status, (await get(S.name, await signed(paul, R.name, "summary", "summary"))).status, (await get(S.name, await signed(vic, S.name, "summary", "summary"))).status]).toEqual([403, 403, 200]);
    // A second register that paul installed: he may read it, and his signature for R is still not one for it.
    const P = await installed(paul);
    expect([(await get(P.name, await signed(paul, R.name, "summary", "summary"))).status, (await get(P.name, await signed(paul, P.name, "summary", "summary"))).status]).toEqual([403, 200]);
    // A key that signed nothing in R; and a request that names paul's key and is signed by vic's.
    expect((await get(R.name, await signed(vic, R.name, "summary", "summary"))).body).toEqual({ ok: false, reason: "forbidden" });
    const forged = signRead({ v: 1, to: R.name, actor: paul.key, read: "summary", arg: "summary", notAfter: soon(60) }, vic.secret);
    expect((await get(R.name, `Signed ${b64url(canonicalBytes(forged))}`)).status).toBe(403);

    // Replay over the log by a signed read: the install's key reads the genesis only, so the report is incomplete, and says so.
    platformNet.sessions = true;
    platformNet.secret = b64url(new Uint8Array(32).fill(9));
    try {
      const { report, why } = await verify(httpSource(SERVICE, { fetch: routed, reader: signedLogReader(secretSigner(paul.secret), { now: () => Date.parse(net.clock.now) }) }), { mode: "replay", scope: R.name, platform, grants: "proven" });
      expect([report.result, report.coverage.map((c) => [c.scope.scope, c.from, c.through]), why]).toEqual(["incomplete", [[R.name, 0, 0]], "the history could not be read through its head, entry 1: the source holds no entry 1 of " + R.name]);
    } finally {
      platformNet.sessions = false;
      platformNet.secret = null;
    }
  });

  test("a signed read is refused past its notAfter, with a notAfter further ahead than an intent may live, and once the key's last entry is older than the window", async () => {
    net.hold = net.deaf = null;
    const R = await installed(paul);
    const late = await signed(paul, R.name, "summary", "summary");
    // Ahead by one second more than an intent may live: signed with the bytes package, since the client signs no such read.
    const far: ReadRequest = { v: 1, to: R.name, actor: paul.key, read: "summary", arg: "summary", notAfter: soon(PROPOSED_BOUNDS.intentLifetimeSeconds + 1) };
    const farthest = `Signed ${b64url(canonicalBytes(signRead(far, paul.secret)))}`;
    const edge = `Signed ${b64url(canonicalBytes(signRead({ ...far, notAfter: soon(PROPOSED_BOUNDS.intentLifetimeSeconds) }, paul.secret)))}`;
    expect([(await get(R.name, farthest)).status, (await get(R.name, edge)).status, (await get(R.name, late)).status]).toEqual([403, 200, 200]);
    // Rita claims ten minutes after the install.
    net.clock.now = soon(600);
    expect(await R.stub.submit(await R.intent(rita, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", founderHandle: "@rita", recoveryKey: keys.sam.key } }), [])).toMatchObject({ answer: "accepted" });
    // The read signed before is past its notAfter.
    expect((await get(R.name, late)).status).toBe(403);
    // Six minutes later the install is older than the window, and the claim is not: paul is refused, and rita reads.
    net.clock.now = soon(360);
    expect([(await get(R.name, await signed(paul, R.name, "summary", "summary"))).status, (await get(R.name, await signed(rita, R.name, "summary", "summary"))).status]).toEqual([403, 200]);
  });

  test("the claim's key reads the summary and genesis of the directory the claim caused, and of membership, the rules scope and the destination that the directory caused, with no session; the install's key, which signed no claim, reads none of them", async () => {
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
      (await get(M.name, "Signed not-a-read")).status,
      (await get(M.name, header(request, paul.secret))).status,
      (await get(M.name, header({ ...request, to: D.name }))).status,
      (await get(`${M.name}/entries/0`, header({ ...request, read: "entry", arg: "1" }))).status,
      (await get(M.name, header({ ...request, notAfter: net.clock.now }))).status,
      (await get(M.name, header({ ...request, notAfter: soon(PROPOSED_BOUNDS.intentLifetimeSeconds + 1) }))).status,
      calls,
    ]).toEqual([403, 403, 403, 403, 403, 403, []]);
    const now = net.clock.now;
    try {
      net.clock.now = timeOf(timeMs(now)! - 1000);
      expect([(await get(M.name, await signed(rita, M.name, "summary", "summary"))).status, calls]).toEqual([503, []]);
    } finally { net.clock.now = now; }
    // For each of the four scopes: the summary, the genesis, and a history that holds the genesis only.
    const reads = async (who: Actor, node: Platform) => {
      const history = await get(`${node.name}/history`, await signed(who, node.name, "history", "0"));
      return [(await get(node.name, await signed(who, node.name, "summary", "summary"))).status, (await get(`${node.name}/entries/0`, await signed(who, node.name, "entry", "0"))).status, history.status, history.status === 200 ? seqs(history.body) : null];
    };
    expect(await Promise.all([D, M, Ru, G].map((node) => reads(rita, node)))).toEqual([D, M, Ru, G].map(() => [200, 200, 200, [0]]));
    expect(calls.length).toBeGreaterThan(0); // positive control: the valid chain read reaches the real ancestor
    // Control: the same reads with no header, and by the install's key, are forbidden.
    expect(await Promise.all([D, M, Ru, G].map(async (node) => [(await get(node.name)).status, ...(await reads(paul, node))]))).toEqual([D, M, Ru, G].map(() => [403, 403, 403, 403, null]));
    // The root's key reads the summary and the genesis only: an entry after the genesis, which it did not sign, is forbidden.
    expect([(await get(`${D.name}/entries/1`, await signed(rita, D.name, "entry", "1"))).status, (await get(`${M.name}/entries/1`, await signed(rita, M.name, "entry", "1"))).status]).toEqual([403, 403]);
    // A recent local signer needs no chain, even after restart. Keep the
    // child's dispatcher off so only read authorization can call resolver.
    expect(await M.act(rita, "seat", { expected: await M.expected({ roster: 0 }) })).toMatchObject({ answer: "accepted" });
    await M.restart();
    calls.length = 0;
    expect([(await get(M.name, await signed(rita, M.name, "summary", "summary"))).status, calls]).toEqual([200, []]);
  });

  test("the window of a read by the cause chain is measured at the root entry: the claim, not the genesis that the claim caused", async () => {
    net.hold = net.deaf = null;
    const claimed = net.clock.now;
    // The directory and its children are created ten minutes after the claim.
    const { D, children } = await founded(600);
    const M = children[0]!;
    const at = (seconds: number) => { net.clock.now = timeOf(timeMs(claimed)! + seconds * 1000); };
    const both = async () => [(await get(D.name, await signed(rita, D.name, "summary", "summary"))).status, (await get(M.name, await signed(rita, M.name, "summary", "summary"))).status];
    // Fourteen minutes after the claim, it is within the window: rita reads both.
    at(840);
    expect(await both()).toEqual([200, 200]);
    // Sixteen minutes after the claim, it is older than the window, and the geneses are six minutes old: both are forbidden.
    at(960);
    expect(await both()).toEqual([403, 403]);
  });

  // Made by hand: a chain of geneses, each the creation of the one before, from rita's act. No scope judged them. It shows the bound of
  // `rootOf`, which no real chain reaches: the longest of the platform's is two causes, from membership to the claim.
  test("a cause chain is followed through at most four causes: a genesis four creations from the signed act has its root, one five creations away has none, an entry that cannot be read is unavailable, and a cause that names no source has no root", async () => {
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
    const root = { actor: rita.key, time: t(0) };
    expect([await rootOf(chain[0]!, read), await rootOf(chain[CHAIN_STEPS - 1]!, read), await rootOf(chain[CHAIN_STEPS]!, read)]).toEqual([root, root, null]);
    // Control: the same chain under a bound one longer has its root. An entry of the chain that cannot be read now; and a genesis whose
    // source is a genesis that its seed's cause does not name.
    const stray: Entry = { ...chain[1]!, input: { ...(chain[1]!.input as Extract<Entry["input"], { type: "genesis" }>), seed: { ...(chain[1]!.input as Extract<Entry["input"], { type: "genesis" }>).seed, cause: d("c") } } };
    expect([await rootOf(chain[CHAIN_STEPS]!, read, CHAIN_STEPS + 1), await rootOf(chain[1]!, async (use) => (use.content === useOf(fact(act), act).content ? null : read(use))), await rootOf(stray, read)]).toEqual([root, "unavailable", null]);
  });
});
