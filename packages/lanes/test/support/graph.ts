/**
 * The one fixture of the lane scenarios: a small graph of real scopes, each
 * a Durable Object with its own SQLite storage in one namespace, under the
 * two pinned lane definitions. A scenario builds what it needs of it: an
 * office, a goal, a change lane, and the concerns a goal creates.
 *
 * | Part | Is |
 * |---|---|
 * | The definitions | `issue` and `change` of this package. The office creates each lane by its pinned digest, and each lane's handle is checked against the same pin. Real. |
 * | The lanes | Real scopes, written through the turn, the store and the dispatchers of the scope package. |
 * | The acts | Signed by the client's declared handle, and sent to the scope service's own operations. An office is founded over the Worker's HTTP routes, and `over` sends one act over them. |
 * | The office | A made-up directory definition that creates the lanes. A test fixture: the real directory of the platform package creates no lane yet: its guard on an active definition reads an observation of the rules scope, which no runtime reads before a turn. |
 * | The members | The key set of derive's fixtures. Test keys. |
 * | Authority | The scope package's test authority: every presented grant is current. A STAND-IN. It shows nothing about real authority. |
 * | The capability, on its code | `onCode`: the code of `hold@1` and `git-read@1`, as the production ports hold it. Real: the records, the steps, the guards and the outcomes' rules. A scenario that uses it says so. |
 * | The Git host | `Host`: a STAND-IN for the systems outside the service. It answers each attempt that the capability's code opened: a mint, a revocation, the creation of a staged ref and the ancestry read. No repository exists, and no commit is read. |
 * | The capability, scripted | The scope package's scripted test capability, over `net.capability`. A STAND-IN for the code of `hold@1` and `git-read@1`. By default every capability guard refuses. `capable` makes them hold. It shows nothing about staging, ancestry, pins, licenses or exports. |
 * | Platform peers | `Peer`: handwritten entries of a rules scope and a destination, read through the namespace's test resolver. SCRIPTED. One shows the lane's side of a delivery and nothing about the peer. |
 * | The clock | One scripted clock for the namespace. It starts in 2099, so no stored alarm fires by itself. |
 * | The scheduler | The dispatchers, run by `settle`; an alarm, run by `alarm`; transport, held or made deaf through `net`. No test waits on the wall clock. |
 */

import { env } from "cloudflare:workers";
import { SELF, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { expect, onTestFinished } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Answer, Bounds, DeclaredDefinition, Digest, Duty, Entry, FactRef, FieldValue, Grant, Input, Message, Receipt, ScopeId, ScopeRef, Sealed, Seed, SignedIntent } from "@generalbusiness/artroom-contract";
import { entryHash, intentDigest, newIncarnation, scopeIdOf, signIntent, textDigest } from "@generalbusiness/artroom-bytes";
import { ScopeHandle, declaredHandle, found, httpTransport, secretSigner, signedIntent, type AskedOf, type DeclaredHandle, type Kind, type Signed, type Transport } from "@generalbusiness/artroom-client";
import { MemoryState, alsoItems, applyEntry, isFactRef, snapshotInput, stagedRefName, timeMs, timeOf, validateDefinition, type AncestryCheck, type Delivered, type Item, type StagedRef, type ValidDefinition } from "@generalbusiness/artroom-derive";
import { grantOf, keys, type Actor } from "@generalbusiness/artroom-derive/testing";
import type { Checkpointed, Delivery, EffectAnswer, EffectRequest } from "@generalbusiness/artroom-scope";
import { CODE, net, type CapabilityScript } from "@generalbusiness/artroom-scope/testing";
import { api, route } from "@generalbusiness/artroom-scope/worker";
import { DIGESTS, change, definitions, issue } from "../../src/index.ts";

export { net };
/** rita requests. una and vic are agents, for paul and quinn. paul and sam are members with no part in the work. */
export const { rita, una, vic, paul, sam } = keys;

/** Any value: the test readers port lets every reader read. */
export const reader = "a test reader";
/**
 * How the client reaches the scopes. `transport` is the scope service's own
 * operations (`api`, which the Worker's routes and its service-binding
 * entrypoint both call and add nothing to), called in the test's isolate:
 * every act and read of the fixture goes through it. `http` is the client's
 * transport over the Worker's HTTP routes, for the few calls that are about
 * a route: the founding of an office, one act, and the replay.
 *
 * The reason is cost. In the Workers pool a call through the Worker's
 * entrypoint, by `SELF.fetch` or by a service binding, takes longer the more
 * of them one run has made: observed, 50 calls took 57 milliseconds at first
 * and 321 after 150 more, while 300 calls of `api` took 150 each time. The
 * scope package's own tests show both wire transports.
 */
export const transport: Transport = api(env.NET);
export const http = httpTransport("https://scopes.test", { fetch: (url, init) => SELF.fetch(url, init) });
/** The Worker's routes called in the test's isolate, for a verifier that reads the history over HTTP: the same `route` the Worker runs, without the pool's entrypoint. */
export const routed = (url: string, init?: RequestInit): Promise<Response> => route(new Request(url, init), env.NET);

/** `seconds` after the shared clock's `now`. */
export const soon = (seconds: number) => timeOf(timeMs(net.clock.now)! + seconds * 1000);

function valid(definition: DeclaredDefinition): ValidDefinition {
  const checked = validateDefinition(definition, PROPOSED_BOUNDS);
  if (!checked.ok) throw new Error(`${definition.name} is refused: ${JSON.stringify(checked.problems)}`);
  return checked.definition;
}

/**
 * The office: a made-up directory, and a test fixture. It is founded with a
 * text beside its founding intent. `open-issue` creates a lane under the
 * pinned `issue` digest, and `open-change` one under the pinned `change`
 * digest. Each clause of a creation moves the row that asked for it.
 */
const creation = { applied: [{ state: "created" }, { ref: { slot: "child", from: { sender: true } } }], refused: [{ state: "refused" }], conflict: [{ state: "conflict" }] } as const;
export const officeDefinition = {
  format: "artroom-definition-1",
  name: "office",
  profile: { name: "restricted", version: 1 },
  capabilities: [],
  genesis: "found",
  items: {
    repository: {
      many: false, max: 1, initial: "open", states: { open: { final: false } }, parties: {}, refs: {},
      values: { readme: { fixed: false, required: false, of: { type: "text", max: 4096, detached: true } } },
    },
    lane: {
      many: true, max: 16, initial: "asked", states: { asked: { final: false }, created: { final: false }, refused: { final: true }, conflict: { final: true } },
      parties: {}, refs: { child: { fixed: false, required: false, to: { type: "scope", kind: "lane" } } }, values: {},
    },
  },
  acts: {
    found: {
      step: "open", on: "repository", grant: "office.found", also: {},
      fields: { readme: { type: "text", max: 4096, detached: true, required: false } },
      guards: [], effects: [{ value: { slot: "readme", from: { field: "readme" } } }], sends: [], attention: [],
    },
    "open-issue": {
      step: "open", on: "lane", grant: "office.open", also: {},
      fields: { title: { type: "text", max: 256, required: true }, conditions: { type: "list", of: { type: "text", max: 4096 }, max: 16, required: true } },
      guards: [], effects: [], attention: [],
      sends: [{ create: { kind: "lane", definition: DIGESTS.issue, fields: { opener: { signer: true }, title: { field: "title" }, conditions: { field: "conditions" } }, result: creation } }],
    },
    "open-change": {
      step: "open", on: "lane", grant: "office.open", also: {},
      fields: { title: { type: "text", max: 256, required: true }, destination: { type: "scope", kind: "destination", required: true }, rules: { type: "scope", kind: "rules", required: true } },
      guards: [], effects: [], attention: [],
      sends: [{
        create: {
          kind: "lane", definition: DIGESTS.change,
          fields: { opener: { signer: true }, title: { field: "title" }, destination: { field: "destination" }, rules: { field: "rules" }, draft: { const: false } },
          result: creation,
        },
      }],
    },
  },
  receives: {},
  timed: {},
  rules: {},
} as const satisfies DeclaredDefinition;

const VALID = { office: valid(officeDefinition), issue: valid(issue), change: valid(change) };

/**
 * A table for the scripted test capability, a STAND-IN, under which every
 * capability guard of the two lane definitions holds, and a pin that is held
 * or released is recorded as the capability's `pin` record. A test that sets
 * it shows what a lane row does once a capability has answered. It shows
 * nothing about a real hold, a staged commit, a Git read or a provider.
 */
export const capable: CapabilityScript = {
  guards: { "hold@1:staged": () => true, "git-read@1:ancestry": () => true, "hold@1:pin": () => true },
  effects: {
    "hold@1:pin-hold": (args) => [{ kind: "pin", key: [String(args["commit"])], state: "held", values: { commit: args["commit"] } }],
    "hold@1:pin-release": (args) => [{ kind: "pin", key: [String(args["commit"])], state: "released", values: { commit: args["commit"] } }],
  },
};

/**
 * A STAND-IN for the systems outside the service: the Git host of one
 * canonical repository, and the reader that walks its commits. It answers
 * the one request of each attempt that the code of `hold@1` opened, from
 * the sealed entry that opened the operation, as the driver gives it.
 *
 * - A mint: a token ID that it counts, with an end time. A revocation: yes.
 * - The creation of a staged ref: it keeps the ref, and answers with a read
 *   that shows it.
 * - The ancestry read: the staged refs that it keeps, as the snapshot, and
 *   a record that found nothing of other work on the commit or under it.
 *   No commit exists and none is walked: the record is the answer of a walk
 *   over a repository where the commit's only parent is published.
 *
 * So a scenario with it shows what a lane's records and guards do with
 * such answers, in the order that real outcomes arrive. It shows nothing
 * about a real host, a real walk, a fork, or a credential. The creation of a
 * fork and the read of a head are not answered: their rules are not built
 * (plan step 18), and those attempts stay recorded and not sent.
 */
export class Host {
  readonly refs: StagedRef[] = [];
  /** Every request that reached the stand-in, as its owner's kind. */
  readonly asked: string[] = [];
  #tokens = 0;
  accepts(owner: string, kind: string): boolean { return owner === "hold@1" && ["mint", "revoke", "stage", "check"].includes(kind); }
  send(request: EffectRequest): EffectAnswer | null {
    this.asked.push(request.kind);
    const records = request.origin.entry.effects.flatMap((effect) => (effect.effect === "record" ? [effect] : []));
    if (request.kind === "mint") return { result: "confirmed", evidence: { basis: "own-answer", body: { token: `token-${++this.#tokens}`, ends: soon(600) } } };
    if (request.kind === "revoke") return { result: "confirmed", evidence: { basis: "own-answer", body: {} } };
    if (request.kind === "stage") {
      const root = records.find((r) => r.kind === "root" && r.values["operation"] === request.operation);
      if (!root) return null;
      const ref = stagedRefName(request.scope, root.values["commit"] as string, root.key[0] as number);
      if (!this.refs.some((kept) => kept.ref === ref)) this.refs.push({ ref, target: root.values["commit"] as string });
      return { result: "confirmed", evidence: { basis: "read", body: { ref, value: root.values["commit"] } } };
    }
    const pin = records.find((r) => r.kind === "pin" && r.values["check"] === request.operation);
    const snapshot = snapshotInput(this.refs);
    if (!pin || !snapshot) return null;
    const record: AncestryCheck = {
      commit: pin.values["commit"] as string, root: { number: pin.values["root"] as number, state: "live" }, head: "0".repeat(40),
      snapshot: { digest: snapshot.digest, count: this.refs.length }, start: { foreign: null }, stops: [], F: [], visited: 1,
    };
    return { result: "confirmed", evidence: { basis: "own-answer", body: { record } }, retain: [snapshot] };
  }
}

/**
 * Run every scope of the namespace on the capability's code, as the
 * production ports hold it, with a new `Host`, a STAND-IN, for the outside.
 * The scenario that asked leaves the namespace as `graph` made it.
 */
export function onCode(): Host {
  const host = new Host();
  net.capability = CODE;
  net.outside = host;
  return host;
}

type Remote = {
  deliver(envelope: Delivered): Promise<Delivery>; dispatch(): Promise<number>; checkpoint(): Promise<Checkpointed>;
  prepare(signed: SignedIntent, grants: readonly Grant[], capability: string, step: string): Promise<Answer>; effect(): Promise<number>;
};
/** What the graph needs of a scope, whatever its definition: its entries and its dispatcher. */
type Member = { entry(seq: number): Promise<Entry>; readonly stub: Remote };
const objectOf = (name: string): DurableObjectStub => env.NET.get(env.NET.idFromName(name));

/** How an act was answered, in one text: `accepted`; or the refusal's code, with the name when the failed guard or the capability declares one. */
export const answered = (answer: Answer): string =>
  (answer.answer === "refused" ? (answer.name === undefined ? answer.reason : `${answer.reason}: ${answer.name}`) : answer.answer === "accepted" ? "accepted" : `${answer.answer}: ${answer.reason}`);

/** One real scope of the graph, with the client's handle on it: typed from the definition's own data, and checked against the digest the scope publishes. */
export class Node<D extends DeclaredDefinition> {
  constructor(readonly handle: DeclaredHandle<D>, readonly valid: ValidDefinition) {}

  get name(): ScopeId { return this.handle.scope.scope; }
  get at(): ScopeRef { return this.handle.at; }
  get object(): DurableObjectStub { return objectOf(this.name); }
  get stub(): Remote { return this.object as unknown as Remote; }

  /** The history read so far, and the state it folds to. Each read asks only for the entries after these, one read at a time. */
  readonly #log: Sealed[] = [];
  readonly #state = new MemoryState();
  #reading: Promise<unknown> = Promise.resolve();

  /** The whole history, each entry with its hash: what was read before, and every page after it. */
  sealed(): Promise<readonly Sealed[]> {
    const read = this.#reading.then(async () => {
      for (let more = true; more; ) {
        const page = await this.handle.scope.history(String(this.#log.length));
        if (!page.ok) throw new Error(`no history of ${this.name}: ${page.reason}`);
        for (const sealed of page.value) {
          applyEntry(this.#state, this.valid, sealed.entry, sealed.hash);
          this.#log.push(sealed);
        }
        more = page.next !== undefined;
      }
      return this.#log;
    });
    this.#reading = read.catch(() => undefined);
    return read;
  }
  async entries(): Promise<Entry[]> { return (await this.sealed()).map((s) => s.entry); }
  /** The entry at `seq`, and the fact that names it. */
  async entry(seq: number): Promise<Entry> { return (await this.sealed())[seq]!.entry; }
  async fact(seq: number): Promise<FactRef> { return { at: this.at, seq, hash: (await this.sealed())[seq]!.hash }; }
  /** The state that the history folds to, by derive's own fold: every item, live or final, with its revision. */
  async state(): Promise<MemoryState> {
    await this.sealed();
    return this.#state;
  }
  /** One item as it is now: a copy, so that a scenario can compare it with the item later. */
  async item(id: number): Promise<Item> { return structuredClone((await this.state()).item(id)!); }
  async duties(): Promise<readonly Duty[]> {
    const read = await this.handle.scope.outbox();
    if (!read.ok) throw new Error(`no outbox of ${this.name}: ${read.reason}`);
    return read.value;
  }

  /** A grant of every action of the definition to every key of the fixture set. The test authority calls each current. */
  grants(): Grant[] {
    const actions = [...new Set(Object.values(this.handle.definition.acts).map((a) => a.grant))];
    return Object.values(keys).map((who) => grantOf(who, this.at, actions));
  }
  /**
   * One signed intent, by the client's declared handle. `expected` is filled
   * in when the scenario gives none: the revision of the item the act is on
   * and of each other item it names, read from the scope's history. So a
   * scenario states what it asks, and not the revisions.
   */
  async signed<K extends Kind<D>>(who: Actor, kind: K, asked: AskedOf<D, K>): Promise<Signed> {
    const given = asked as { on?: number | null; expected?: Record<string, number>; fields?: Record<string, FieldValue> };
    const act = this.valid.declared.acts[kind]!;
    let expected = given.expected;
    if (!expected) {
      const state = await this.state();
      // A fact of this scope names a local entry, and so the item that entry opened.
      const fields = Object.fromEntries(Object.entries(given.fields ?? {}).map(([name, v]) => [name, isFactRef(v) && v.at.scope === this.name ? v.seq : v]));
      const on = act.step === "transition" && typeof given.on === "number" ? state.item(given.on) : null;
      const also = alsoItems(state, this.valid, act.also, fields, on);
      expected = { ...(on ? { on: on.revision } : {}), ...Object.fromEntries(also.ok ? also.items.map(([name, item]) => [name, item.revision]) : []) };
    }
    return this.handle.intent(secretSigner(who.secret), kind, { ...asked, expected }, { now: timeMs(net.clock.now)! });
  }
  submit({ signed, beside }: Signed): Promise<Answer> { return this.handle.submit(signed, this.grants(), beside); }
  /** The same submission through another transport of the client, such as the HTTP routes. */
  over(through: Transport, { signed, beside }: Signed): Promise<Answer> { return new ScopeHandle(through, this.name, reader).submit(signed, this.grants(), beside); }
  async act<K extends Kind<D>>(who: Actor, kind: K, asked: AskedOf<D, K>): Promise<Answer> { return this.submit(await this.signed(who, kind, asked)); }
  /** How the act was answered, as `answered` writes it. */
  async asks<K extends Kind<D>>(who: Actor, kind: K, asked: AskedOf<D, K>): Promise<string> { return answered(await this.act(who, kind, asked)); }
  /** An act that must be accepted. */
  async did<K extends Kind<D>>(who: Actor, kind: K, asked: AskedOf<D, K>): Promise<Receipt> {
    const answer = await this.act(who, kind, asked);
    if (answer.answer !== "accepted") expect.fail(`${kind} was not accepted: ${JSON.stringify(answer)}`);
    return answer.receipt;
  }
  /** One step of `hold@1`, asked of this lane with that signed intent, and every grant of the fixture, as `submit` presents them. */
  prepare(signed: SignedIntent, step: string): Promise<Answer> { return this.stub.prepare(signed, this.grants(), "hold@1", step); }
  /** Let the operations driver send what is due to the outside stand-in and record each answer, until nothing is due. */
  async effects(): Promise<void> {
    for (let made = 1; made > 0;) made = await this.stub.effect();
  }
  /**
   * The step `instance`, by the hold's holder: the signed intent of a step
   * with no act (authority note, section 5.7). `task` is a reference that no
   * scope answers: no task scope is delivered.
   */
  async instance(who: Actor, hold: number, instance = "i-1"): Promise<Answer> {
    const fields = { hold, task: { ...this.at, kind: "task" } as ScopeRef, instance };
    return this.prepare(signIntent({ v: 1, to: this.at, actor: who.key, kind: "hold@1:instance", on: null, expected: {}, fields, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) }, who.secret), "instance");
  }
  /**
   * One act of this lane with its preparation, on the capability's code: the
   * intent is signed, the lane is asked for the step `stage`, or for the step
   * `check` when a live root already holds the commit, and the outside
   * stand-in answers what the step opened. The signed intent is returned,
   * to be submitted. A step that is refused leaves the act to say why.
   */
  async staged<K extends Kind<D>>(who: Actor, kind: K, asked: AskedOf<D, K>): Promise<Signed> {
    const signed = await this.signed(who, kind, asked);
    const staged = await this.prepare(signed.signed, "stage");
    if (staged.answer === "refused" && staged.reason === "guard-failed") await this.prepare(signed.signed, "check");
    await this.effects();
    return signed;
  }
  /** How an act with its preparation was answered, as `answered` writes it. */
  async stagedAsks<K extends Kind<D>>(who: Actor, kind: K, asked: AskedOf<D, K>): Promise<string> { return answered(await this.submit(await this.staged(who, kind, asked))); }
  /** An act with its preparation that must be accepted. */
  async stagedDid<K extends Kind<D>>(who: Actor, kind: K, asked: AskedOf<D, K>): Promise<Receipt> {
    const answer = await this.submit(await this.staged(who, kind, asked));
    if (answer.answer !== "accepted") expect.fail(`${kind} was not accepted: ${JSON.stringify(answer)}`);
    return answer.receipt;
  }
  /** An intent that the client's handle would not sign, signed as it is: for a shape that the scope itself must refuse. */
  raw(who: Actor, kind: string, fields: Record<string, FieldValue>): Promise<Answer> {
    const signed: SignedIntent = signIntent({ v: 1, to: this.at, actor: who.key, kind, on: null, expected: {}, fields, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) }, who.secret);
    return this.handle.submit(signed, this.grants());
  }

  /** Send `n` of entry `seq`, as transport carries it. */
  async envelope(seq: number, n = 0): Promise<Delivered> {
    const { entry, hash } = (await this.sealed())[seq]!;
    const send = entry.sends.find((s) => s.n === n)!;
    return { to: send.to, from: { at: entry.at, seq, hash }, n, message: send.message };
  }
  /** Run the object's stored alarm now. False: none was stored. */
  alarm(): Promise<boolean> { return runDurableObjectAlarm(this.object); }
  /** The time the object's alarm is stored for, or null. */
  alarmAt(): Promise<number | null> { return runInDurableObject(this.object, (_instance, state: DurableObjectState) => state.storage.getAlarm()); }
}

/**
 * A SCRIPTED platform peer: a stand-in for a scope of a platform kind that
 * the scenario does not run. It has a reference and no object. Each entry is written
 * here by hand, with one send, and nothing judged it. A lane reads it
 * through the namespace's test resolver, as it reads any source entry. So a
 * delivery from a peer shows what the lane does with a verified message
 * from a scope of that kind and definition name, and nothing about what a
 * real rules scope or destination would send, or when.
 */
export class Peer {
  readonly at: ScopeRef;
  #seq = 0;
  #first: FactRef | null = null;

  constructor(kind: "rules" | "destination" | "task", readonly under: string) {
    const seed: Seed = { v: 1, kind, definition: `platform:${kind}@1`, creator: null, cause: textDigest(`a scripted peer ${crypto.randomUUID()}`), ordinal: 0 };
    this.at = { scope: scopeIdOf(seed), inc: newIncarnation(crypto.getRandomValues(new Uint8Array(16))), kind };
  }

  /** One entry with one send to `to`, as an act of kind `kind` would have written it. The envelope is returned, to be delivered. */
  sends(to: ScopeRef, message: Message, kind = "publish"): Delivered {
    const seq = ++this.#seq;
    const intent = { v: 1, to: this.at, actor: sam.key, kind, on: null, expected: {}, fields: {}, idempotencyKey: `p${seq}`, notAfter: soon(60) } as const;
    const input: Input = { type: "act", signed: signIntent(intent, sam.secret), authority: [], presented: {} };
    const entry: Entry = { v: 1, at: this.at, seq, prev: `sha256:${"0".repeat(64)}`, time: net.clock.now, clamped: false, epoch: 0, input, uses: [], prepared: [], effects: [], sends: [{ n: 0, to, message }] };
    const hash = entryHash(entry);
    net.peers.set(hash, { entry, under: this.under });
    this.#first ??= { at: this.at, seq, hash };
    return { to, from: { at: this.at, seq, hash }, n: 0, message };
  }
  /** One update of the peer's one relationship item with `to`: the first names the entry being written, and a later one that entry. */
  relate(to: ScopeRef, name: string, state: string, detail: Record<string, FieldValue>): Delivered {
    return this.sends(to, { class: "request", type: "relate", body: { name, item: this.#first ?? { self: true }, state, detail } });
  }
}

/** The graph: one office, the lanes it creates, the two scripted peers a change lane names, and every scope a scenario adds. */
export class Graph {
  readonly nodes: Member[] = [];
  /** SCRIPTED peers: the rules scope and the destination that a change lane names. */
  readonly rules = new Peer("rules", "platform:rules");
  readonly destination = new Peer("destination", "platform:destination");

  constructor(readonly office: Node<typeof officeDefinition>) { this.nodes.push(office); }

  /** Wait until no dispatcher of the graph has anything to do now. It carries nothing: the dispatchers do. */
  async settle(): Promise<void> {
    for (let made = 1; made > 0;) {
      made = 0;
      for (const node of this.nodes) made += await node.stub.dispatch();
    }
  }
  /** Move the shared clock on, and let the dispatchers do what is then due. */
  async later(seconds: number): Promise<void> {
    net.clock.now = soon(seconds);
    await this.settle();
  }

  /** The real scope under `definition` whose object is named `name`, once it has a genesis: its handle is checked against the pinned digest. */
  async node<const D extends DeclaredDefinition>(name: ScopeId, definition: D, validated: ValidDefinition): Promise<Node<D>> {
    const declared = await declaredHandle(new ScopeHandle(transport, name, reader), definition);
    if (!declared.ok) throw new Error(`no handle on ${name}: ${JSON.stringify(declared)}`);
    const node = new Node(declared.handle, validated);
    this.nodes.push(node);
    return node;
  }
  /** The lane that send `n` of entry `seq` of `parent` creates, once the creation is confirmed. */
  async created<const D extends DeclaredDefinition>(parent: Member, seq: number, definition: D, validated: ValidDefinition, n = 0): Promise<Node<D>> {
    const name = scopeIdOf((await parent.entry(seq)).sends.find((s) => s.n === n)!.to as Seed);
    // The child's dispatcher has work as soon as it has a genesis, and it is not in the graph yet.
    const child = objectOf(name) as unknown as Remote;
    for (let made = 1; made > 0;) made = (await parent.stub.dispatch()) + (await child.dispatch());
    const node = await this.node(name, definition, validated);
    await this.settle();
    return node;
  }

  /** A goal: an `issue` lane that the office creates for rita, confirmed. `bounds`: the bounds of this one scope. */
  async goal(bounds?: Bounds): Promise<Node<typeof issue>> {
    const asked = await this.office.signed(rita, "open-issue", { fields: { title: "A goal", conditions: ["it works"] } });
    return this.#lane(asked, issue, VALID.issue, DIGESTS.issue, bounds);
  }
  /** A change lane: a `change` lane that the office creates for rita, open, which names the two scripted peers. `bounds`: the bounds of this one scope. */
  async change(bounds?: Bounds): Promise<Node<typeof change>> {
    const asked = await this.office.signed(rita, "open-change", { fields: { title: "A change", destination: this.destination.at, rules: this.rules.at } });
    return this.#lane(asked, change, VALID.change, DIGESTS.change, bounds);
  }
  /** The lane that the office creates for that signed intent. The seed of the lane names this one intent as its cause, so the name of its object is known before it exists. */
  async #lane<const D extends DeclaredDefinition>(asked: Signed, definition: D, validated: ValidDefinition, digest: Digest, bounds?: Bounds): Promise<Node<D>> {
    const seed: Seed = { v: 1, kind: "lane", definition: digest, creator: this.office.at, cause: intentDigest(asked.signed.intent), ordinal: 0 };
    if (bounds) net.sized.set(scopeIdOf(seed), bounds);
    const answer = await this.office.submit(asked);
    if (answer.answer !== "accepted") throw new Error(`the lane was not asked for: ${JSON.stringify(answer)}`);
    const node = await this.created(this.office, answer.receipt.fact.seq, definition, validated);
    if (node.name !== scopeIdOf(seed)) throw new Error("the lane has another name than its seed was expected to give");
    return node;
  }
  /** The concern lane that the `add-concern` entry `seq` of `goal` created. */
  concern(goal: Node<typeof issue>, seq: number): Promise<Node<typeof issue>> {
    return this.created(goal, seq, issue, VALID.issue);
  }
}

/** The text that travels beside the office's founding intent. */
export const README = "The office of a test repository.";

/**
 * A new graph: an office founded by rita, which retains the two lane
 * declarations for the lanes it creates. Transport is undisturbed, and the
 * scripted capability refuses every guard, until the scenario says
 * otherwise: `capable` makes the stand-in's guards hold, and `onCode` runs
 * the namespace on the capability's code with no stand-in for it. With no
 * capability code at all, no scope runs under either lane definition: the
 * scope package's founding test shows that.
 */
export async function graph(): Promise<Graph> {
  net.hold = net.deaf = null;
  net.capability = {};
  net.outside = null;
  const founding = await signedIntent(secretSigner(rita.secret), { to: null, kind: "found", fields: { readme: textDigest(README) } }, { now: timeMs(net.clock.now)! });
  // Over the Worker's HTTP route: the founding intent names the digest of the text, and the text travels beside it in the body.
  const { answer, scope } = await found(http, founding, officeDefinition, definitions, reader, { texts: [README] });
  if (answer.answer !== "accepted" || !scope) throw new Error(`the office was not founded: ${JSON.stringify(answer)}`);
  const declared = await declaredHandle(new ScopeHandle(transport, scope.scope, reader), officeDefinition);
  if (!declared.ok) throw new Error(`no handle on the office: ${JSON.stringify(declared)}`);
  const made = new Graph(new Node(declared.handle, VALID.office));
  // The namespace's controls are shared with every test of the run. The test that asked for the graph leaves them as it found
  // them, once no dispatcher of the graph is still at work: a scope that reads its definition with no capability cannot run.
  onTestFinished(async () => {
    net.hold = net.deaf = null;
    await made.settle();
    net.capability = null;
    net.outside = null;
  });
  return made;
}
