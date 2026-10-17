/**
 * A repository's membership on real scopes, for the tests of authority: an
 * office, a membership scope and the inbox of each member, each a Durable
 * Object with its own SQLite storage in the namespace `PLATFORM`, under the
 * production authority. It is partial preparation for the plan's fixture
 * `repository`, and it is labelled as that: it shows nothing of a founding.
 *
 * | Part | Is |
 * |---|---|
 * | Membership and the inboxes | Real scopes under `platform:membership@1` and `platform:inbox@1`, written through the turn, the store and the dispatchers. |
 * | Authority | The production authority (`repositoryAuthority`): membership judges its own acts on its own head, and an inbox reads the membership scope that its genesis records, through the namespace. No test authority, and no scripted membership. |
 * | The office | A STAND-IN for the creator of a membership scope: a made-up directory, of the platform package's test support. A register's founding creates the real directory and its membership scope on real scopes in `founding-real.test.ts`. The tests of authority keep the office, which needs no register and no host. |
 * | A lane that sends a notice | SCRIPTED: an entry written by hand, read through `net.peers`. It shows the inbox's side of a notice, and nothing about a lane. |
 * | Readers | The test readers, a STAND-IN for read sessions, unless a test sets `platformNet.sessions`: then they are the real read sessions of `sessions.ts`, as `sessions.test.ts` does. |
 * | The clock | The scripted clock of the namespaces. No test waits on the wall clock. |
 */

import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import type { Answer, Beside, Digest, Entry, FactRef, FieldValue, Grant, Intent, PlatformDefinition, Read, RetainedInput, ScopeId, ScopeRef, Seed, SignedIntent } from "@generalbusiness/dap-contract";
import { canonicalize, entryHash, factRefOf, intentDigest, isDigest, isScopeRef, newIncarnation, scopeIdOf, signIntent, textDigest, timeMs, timeOf } from "@generalbusiness/artroom-bytes";
import { hashOfBytes, type MemoryScope } from "@generalbusiness/artroom-replay";
import type { Delivered, Item } from "@generalbusiness/dap-derive";
import { d, keys, type Actor } from "@generalbusiness/dap-derive/testing";
import { MEMBERSHIP, platform } from "@generalbusiness/dap-platform";
import { officeDefinitionFor } from "@generalbusiness/dap-platform/testing";
import type { Delivery, Duty, Sealed, Summary } from "../src/index.ts";
import { route } from "../src/worker.ts";
import { net } from "../src/testing.ts";
import { soon } from "./net.ts";
import { reader } from "./support.ts";

export const { rita, una, vic, sam } = keys;

interface Surface {
  create(founding: SignedIntent, definition: unknown): Promise<{ answer: string }>;
  submit(signed: SignedIntent, grants: readonly Grant[], beside?: Beside): Promise<Answer>;
  summary(reader: unknown): Promise<Read<Summary>>;
  history(reader: unknown, cursor?: string): Promise<Read<readonly Sealed[]>>;
  entry(reader: unknown, seq: number): Promise<Read<Sealed>>;
  outbox(reader: unknown): Promise<Read<readonly Duty[]>>;
  retained(reader: unknown, kind: RetainedInput["kind"], digest: Digest, domain?: string): Promise<Read<RetainedInput>>;
  deliver(envelope: Delivered): Promise<Delivery>;
  dispatch(): Promise<number>;
  observe(asked: unknown): Promise<unknown>;
}

/** The Worker's routes over the namespace `PLATFORM`, called in the test's isolate, for a verifier that reads a history as bytes. */
export const routed = (url: string, init?: RequestInit): Promise<Response> => route(new Request(url, init), env.PLATFORM);

/** One scope of the namespace `PLATFORM`, by name. */
export class Platform {
  #keys = 0;
  #at: ScopeRef | null = null;
  constructor(readonly name: ScopeId) {}

  get object(): DurableObjectStub { return env.PLATFORM.get(env.PLATFORM.idFromName(this.name)); }
  get stub(): Surface { return this.object as unknown as Surface; }

  async summary(): Promise<Extract<Read<Summary>, { ok: true }>> {
    const read = await this.stub.summary(reader);
    if (!read.ok) throw new Error(`no summary of ${this.name}: ${read.reason}`);
    return read;
  }
  async at(): Promise<ScopeRef> { return (this.#at ??= (await this.summary()).value.scope); }
  async sealed(): Promise<readonly Sealed[]> {
    const read = await this.stub.history(reader);
    if (!read.ok) throw new Error(`no history of ${this.name}: ${read.reason}`);
    return read.value;
  }
  async entries(): Promise<Entry[]> { return (await this.sealed()).map((sealed) => sealed.entry); }
  async last(): Promise<Entry> { return (await this.entries()).at(-1)!; }
  /** Item `id`, from the summary's live items. */
  async item(id: number): Promise<Item> {
    const item = (await this.summary()).value.items.find((i) => i.id === id);
    if (!item) throw new Error(`no live item ${id} in ${this.name}`);
    return item;
  }
  /** The expected revision of each named item. */
  async expected(named: Record<string, number>): Promise<Record<string, number>> {
    return Object.fromEntries(await Promise.all(Object.entries(named).map(async ([name, id]) => [name, (await this.item(id)).revision] as const)));
  }
  async intent(who: Actor, kind: string, over: Partial<Intent> = {}): Promise<SignedIntent> {
    return signIntent({ v: 1, to: await this.at(), actor: who.key, kind, on: null, expected: {}, fields: {}, idempotencyKey: `p${this.#keys++}`, notAfter: soon(60), ...over }, who.secret);
  }
  /** An act, with the grants that the caller presents beside it. The production authority reads none of them. */
  async act(who: Actor, kind: string, over: Partial<Intent> = {}, grants: readonly Grant[] = []): Promise<Answer> { return this.stub.submit(await this.intent(who, kind, over), grants); }
  /** An act that must be accepted. Returns the position of its entry. */
  async did(who: Actor, kind: string, over: Partial<Intent> = {}): Promise<number> {
    const answer = await this.act(who, kind, over);
    if (answer.answer !== "accepted") throw new Error(`${kind} was not accepted: ${JSON.stringify(answer)}`);
    return answer.receipt.fact.seq;
  }
  /** The scope that send `n` of this scope's entry `seq` creates: the object that its seed names. */
  async created(seq: number, n = 0): Promise<Platform> {
    return new Platform(scopeIdOf((await this.entries())[seq]!.sends.find((send) => send.n === n)!.to as Seed));
  }
  /** Evict the object. Its storage stays, and everything in memory is gone: its run, and each observation that it held. */
  restart(): Promise<void> { return evictDurableObject(this.object); }
}

/** Wait until no dispatcher of these scopes has anything to do now. It carries nothing. */
export async function settle(...nodes: readonly Platform[]): Promise<void> {
  for (let made = 1; made > 0;) {
    made = 0;
    for (const node of nodes) made += await node.stub.dispatch();
  }
}

/**
 * An office that rita founds, a STAND-IN for the creator of a membership scope, and the membership scope that its founding creates.
 * Rita's key is the founding key, and sam's the recovery key. `hold`: the sends that transport does not deliver, until the test
 * clears `net.hold`.
 */
export async function office(hold: ((envelope: Delivered) => boolean) | null = null, named: PlatformDefinition = MEMBERSHIP): Promise<{ O: Platform; M: Platform }> {
  const officeDefinition = officeDefinitionFor(named);
  net.hold = hold;
  net.deaf = null;
  const intent: Intent = { v: 1, to: null, actor: rita.key, kind: "found", on: null, expected: {}, fields: { founder: rita.key, founderHandle: "@rita", recoveryKey: sam.key }, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
  const seed: Seed = { v: 1, kind: "directory", definition: officeDefinition.digest, creator: null, cause: intentDigest(intent), ordinal: 0 };
  const O = new Platform(scopeIdOf(seed));
  const answer = await O.stub.create(signIntent(intent, rita.secret), officeDefinition.declared);
  if (answer.answer !== "accepted") throw new Error(`the office was not founded: ${JSON.stringify(answer)}`);
  const M = await O.created(0);
  await settle(O, M);
  return { O, M };
}

export interface Repository { O: Platform; M: Platform; ritasInbox: Platform; unasInbox: Platform; ritasKey: number; una: number; unasKey: number }

/** Metadata of this fixture's retained creation protocol, never message bodies. */
export async function inboxConfirmation(repository: Repository) {
  const membership = await repository.M.at(), parent = await repository.M.sealed();
  const retries: { scope: ScopeRef; inbox: ScopeRef; genesis: FactRef; duty: string; class: Duty["class"]; next: number; alarm: number | null; attempts: Duty["attempts"] }[] = [];
  const inboxes = await Promise.all([repository.ritasInbox, repository.unasInbox].map(async inbox => {
    const sealed = await inbox.sealed(), first = sealed[0];
    if (!first || first.entry.input.type !== "genesis") throw new Error("Inbox creation has no retained genesis");
    const born = first.entry.input, genesis = factRefOf(first.entry);
    if (born.seed.kind !== "inbox" || scopeIdOf(born.seed) !== genesis.at.scope || born.inc !== genesis.at.inc || genesis.at.kind !== "inbox") throw new Error("Inbox genesis has another full seed/incarnation");
    if (!born.source || born.n === null || canonicalize(born.source.at) !== canonicalize(membership)) throw new Error("Inbox belongs to another creator");
    const creation = parent[born.source.seq];
    if (!creation || creation.hash !== born.source.hash || !creation.entry.sends.some(send => send.n === born.n && canonicalize(send.to) === canonicalize(born.seed) && canonicalize(send.message) === canonicalize(born.message))) throw new Error("Inbox genesis lacks its exact recorded creation");
    const controls = sealed.filter(row => row.entry.input.type === "delivery" && row.entry.input.message.class === "control" && canonicalize(row.entry.input.from.at) === canonicalize(membership) && canonicalize(row.entry.input.message.genesis) === canonicalize(genesis));
    for (const control of controls) {
      const input = control.entry.input;
      if (input.type !== "delivery") throw new Error("Confirmation is no retained delivery");
      const sender = (await repository.M.sealed())[input.from.seq];
      if (!sender || sender.hash !== input.from.hash || !sender.entry.sends.some(send => send.n === input.n && canonicalize(send.to) === canonicalize(first.entry.at) && canonicalize(send.message) === canonicalize(input.message))) throw new Error("Confirmation lacks its exact retained Native creator send");
    }
    const pairs: [Platform, string][] = [[repository.M, `${born.source.seq}.${born.n}`]];
    for (const send of first.entry.sends) if (send.message.class === "result" && canonicalize(send.to) === canonicalize(membership)) pairs.push([inbox, `0.${send.n}`]);
    for (const row of parent) for (const send of row.entry.sends) if (send.message.class === "control" && canonicalize(send.message.genesis) === canonicalize(genesis) && canonicalize(send.to) === canonicalize(first.entry.at)) pairs.push([repository.M, `${row.entry.seq}.${send.n}`]);
    for (const [sender, id] of pairs) {
      const read = await sender.stub.outbox(reader);
      if (!read.ok) throw new Error("Creation protocol outbox unavailable");
      const duty = read.value.find(d => d.duty === id);
      if (!duty || duty.acknowledged || duty.result || duty.diagnosis || duty.held) continue;
      const [seq, n] = id.split(".").map(Number);
      const timing = await runInDurableObject(sender.object, async (_instance, state) => ({ next: state.storage.sql.exec<{ next: number }>("SELECT next FROM outbox WHERE seq = ? AND n = ?", seq!, n!).toArray()[0]?.next ?? null, alarm: await state.storage.getAlarm() }));
      if (timing.next !== null) retries.push({ scope: await sender.at(), inbox: genesis.at, genesis, duty: id, class: duty.class, next: timing.next, alarm: timing.alarm, attempts: duty.attempts.slice(-4) });
    }
    const summary = await inbox.summary();
    if (canonicalize(summary.value.scope) !== canonicalize(genesis.at)) throw new Error("Inbox view has another full incarnation");
    return { scope: summary.value.scope, status: summary.value.status, genesis, controls: controls.map(row => factRefOf(row.entry)) };
  }));
  return { clock: timeMs(net.clock.now)!, inboxes, retries };
}

/** Complete only these inbox creation duties, with bounded real retry times. */
export async function completeInboxConfirmation(repository: Repository): Promise<void> {
  const began = timeMs(net.clock.now)!;
  for (let round = 0; round < 4; round++) {
    await settle(repository.O, repository.M, repository.ritasInbox, repository.unasInbox);
    const current = await inboxConfirmation(repository);
    if (current.inboxes.every(inbox => inbox.status === "active" && inbox.controls.length === 1)) return;
    if (current.inboxes.some(inbox => inbox.status === "refused")) throw new Error("Native inbox creation refused");
    const retry = current.retries.filter(row => row.next > current.clock && row.alarm === row.next).sort((a, b) => a.next - b.next)[0];
    if (!retry || retry.next - began > 8000 || round === 3) throw new Error("Inbox confirmation did not complete within its retained protocol budget");
    net.clock.now = timeOf(retry.next);
  }
}

interface RepositoryOptions {
  withholdUnaConfirmationOnce?: true;
  beforeInboxCompletion?: (repository: Repository) => Promise<void>;
}

/**
 * A membership scope with two members, each with one device key and an
 * inbox: rita, the founder and an admin, seated on the founding key; and
 * una, a member, who joined by an invitation of rita's. Each inbox is
 * created by the entry that made its member active, and confirmed.
 */
export async function repository(options: RepositoryOptions = {}): Promise<Repository> {
  let predicted: ScopeId | null = null, withheld = false;
  const hold = options.withholdUnaConfirmationOnce ? (envelope: Delivered): boolean => {
    if (!withheld && envelope.message.class === "control" && isScopeRef(envelope.to) && envelope.to.scope === predicted
      && canonicalize(envelope.message.genesis.at) === canonicalize(envelope.to)) { withheld = true; return true; }
    return false;
  } : null;
  const { O, M } = await office(hold);
  try {
    const seat = await M.did(rita, "seat", { expected: { roster: 1 } });
    const ritasKey = await M.did(rita, "first-key", { fields: { member: seat }, expected: await M.expected({ roster: 0, member: seat }) });
    const invitation = await M.did(rita, "invite-member", { fields: { handle: "@una", role: "member", inviteHash: textDigest("the secret of una's invitation, of 32 bytes or more"), inviteEnds: soon(3600) } });
    const joining = await M.intent(una, "join", { fields: { invitation, secret: "the secret of una's invitation, of 32 bytes or more" } });
    // Read the actual pinned join create form; the seed cause is this exact
    // signed input, as derive/sends.ts creates it, never a guessed child name.
    const membership = (await M.summary()).value.definition;
    const creates = platform(membership)?.data.acts["join"]?.sends.filter(form => "create" in form) ?? [];
    const create = creates[0];
    if (creates.length !== 1 || !create || !("create" in create) || create.create.kind !== "inbox" || create.create.definition === "self") throw new Error("Native join has no unique pinned inbox creation");
    const predictedSeed: Seed = { v: 1, kind: "inbox", definition: create.create.definition, creator: await M.at(), cause: intentDigest(joining.intent), ordinal: 0 };
    predicted = scopeIdOf(predictedSeed);
    const joined = await M.stub.submit(joining, []);
    if (joined.answer !== "accepted") throw new Error("Native join was not accepted");
    const unasKey = joined.receipt.fact.seq;
    const actual = (await M.entries())[unasKey]!.sends.filter(send => send.message.class === "request" && send.message.type === "create");
    if (actual.length !== 1 || canonicalize(actual[0]!.to) !== canonicalize(predictedSeed)) throw new Error("Native join recorded another inbox seed");
    const [ritasInbox, unasInbox] = [await M.created(seat), await M.created(unasKey)];
    await settle(O, M, ritasInbox, unasInbox);
    const made = { O, M, ritasInbox, unasInbox, ritasKey, una: invitation, unasKey };
    if ((await unasInbox.at()).scope !== predicted) throw new Error("Native inbox has another actual scope");
    if (options.beforeInboxCompletion) await options.beforeInboxCompletion(made);
    await completeInboxConfirmation(made);
    return made;
  } finally { if (net.hold === hold) net.hold = null; }
}

let lanes = 0;
/**
 * SCRIPTED: a notice from a lane that does not exist. The lane's entry is
 * written by hand, and nothing judged it. It is delivered to the inbox as
 * transport would deliver it. Returns the envelope and transport's answer.
 */
export async function notify(inbox: Platform, fields: Record<string, FieldValue>): Promise<{ envelope: Delivered; answer: Delivery }> {
  const seed: Seed = { v: 1, kind: "lane", definition: d("e"), creator: null, cause: d("f"), ordinal: lanes++ };
  const at: ScopeRef = { scope: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(7)), kind: "lane" };
  const send = { n: 0, to: await inbox.at(), message: { class: "advisory", type: "notify", body: { fields } } } as const;
  const entry: Entry = { v: 1, at, seq: 4, prev: d("0"), time: net.clock.now, clamped: false, epoch: 0, input: { type: "checkpoint", through: 3, state: d("1") }, uses: [], prepared: [], effects: [], sends: [send] };
  const from: FactRef = { at, seq: 4, hash: entryHash(entry) };
  net.peers.set(from.hash, { entry, under: "issue" });
  const envelope: Delivered = { to: send.to, from, n: 0, message: send.message };
  return { envelope, answer: await inbox.stub.deliver(envelope) };
}

/**
 * What a scope's object serves a verifier, copied into memory: each entry's
 * canonical bytes and hash, the declaration that its seed names by digest,
 * and the bytes of each foreign entry that it used. A test changes the copy
 * and never the scope.
 */
export async function copied(node: Platform): Promise<MemoryScope> {
  const sealed = await node.sealed();
  const kept = async (kind: RetainedInput["kind"], digest: Digest): Promise<RetainedInput[]> => {
    const read = await node.stub.retained(reader, kind, digest);
    return read.ok ? [read.value] : [];
  };
  const genesis = sealed[0]!.entry.input as Extract<Entry["input"], { type: "genesis" }>;
  const retained = isDigest(genesis.seed.definition) ? await kept("definition", genesis.seed.definition) : [];
  for (const { entry } of sealed) for (const use of entry.uses) retained.push(...await kept("entry", use.content));
  return { scope: await node.at(), entries: sealed.map(({ entry, hash }) => ({ seq: entry.seq, hash, bytes: canonicalize(entry) })), retained };
}

/**
 * Change entry `seq` of a copied history and seal the history again from
 * there: each later entry takes the new hash of the one before it. The
 * chain is then intact, and only what the entries say has changed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rewritten(scope: MemoryScope, seq: number, change: (entry: any) => void): MemoryScope {
  let prev: string | null = null;
  for (let i = seq; i < scope.entries.length; i++) {
    const entry = JSON.parse(scope.entries[i]!.bytes) as { prev: string | null };
    if (i === seq) change(entry);
    else entry.prev = prev;
    const bytes = canonicalize(entry);
    prev = hashOfBytes(bytes);
    scope.entries[i] = { ...scope.entries[i]!, hash: prev as Digest, bytes };
  }
  return scope;
}
