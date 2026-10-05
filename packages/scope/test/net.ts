/**
 * What the composition tests share: derive's fixture desk and ticket, as
 * real scopes in one namespace, `NET`, each on its own Durable Object
 * storage. A desk is a directory. A ticket is a lane the desk creates.
 * Nothing here carries a message: the dispatchers do. A test only waits for
 * them, moves the shared clock, and disturbs transport through `net`.
 */

import { env } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import type { Answer, DeclaredDefinition, Entry, Grant, Intent, Read, Receipt, ScopeId, ScopeRef, Seed, SignedIntent } from "@generalbusiness/artroom-contract";
import { intentDigest, scopeIdOf, signIntent } from "@generalbusiness/artroom-bytes";
import { timeMs, timeOf, type Delivered, type ValidDefinition } from "@generalbusiness/artroom-derive";
import { deskDefinition, grantOf, keys, ticketDefinition, type Actor, type Over } from "@generalbusiness/artroom-derive/testing";
import type { Delivery, Duty, Sealed, Summary } from "../src/index.ts";
import { route } from "../src/worker.ts";
import { net } from "../src/testing.ts";
import type { NetScope } from "./worker.ts";
import { reader, type Remote } from "./support.ts";

export { net };
export const { rita, una } = keys;

type Peer = Remote & { deliver(envelope: Delivered): Promise<Delivery>; dispatch(): Promise<number> };
const stubOf = (name: string): DurableObjectStub => env.NET.get(env.NET.idFromName(name));

/**
 * The Worker's routes, called in the test's isolate: the same `route` that the Worker's `fetch` runs, over the same namespace.
 * A test that is about a route and not about the pool's entrypoint uses this. In the Workers pool each call through
 * `SELF.fetch` or the service binding takes longer the more of them one run has made (notes/2026-10-05-scope-test-cost.md),
 * so `routes.test.ts` and `client.test.ts` keep the one test for each of those two paths.
 */
export const routed = (url: string, init?: RequestInit): Promise<Response> => route(new Request(url, init), env.NET);

/** `seconds` after the shared clock's `now`. */
export const soon = (seconds: number) => timeOf(timeMs(net.clock.now)! + seconds * 1000);

/** A founding intent signed by rita for a directory under that definition, and the name of the object that holds it. */
export function founding(definition: ValidDefinition, fields: Intent["fields"]): { signed: SignedIntent; name: ScopeId } {
  const intent: Intent = { v: 1, to: null, actor: rita.key, kind: "found", on: null, expected: {}, fields, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
  const seed: Seed = { v: 1, kind: "directory", definition: definition.digest, creator: null, cause: intentDigest(intent), ordinal: 0 };
  return { signed: signIntent(intent, rita.secret), name: scopeIdOf(seed) };
}

/** One scope of the namespace, by name. */
export class Node {
  #keys = 0;
  #at: ScopeRef | null = null;
  constructor(readonly name: ScopeId, readonly declared: DeclaredDefinition) {}

  get object(): DurableObjectStub { return stubOf(this.name); }
  get stub(): Peer { return this.object as unknown as Peer; }

  async summary(): Promise<Extract<Read<Summary>, { ok: true }>> {
    const read = await this.stub.summary(reader);
    if (!read.ok) throw new Error(`no summary of ${this.name}: ${read.reason}`);
    return read;
  }
  /** The scope's reference, once it has a genesis. */
  async at(): Promise<ScopeRef> { return (this.#at ??= (await this.summary()).value.scope); }
  async sealed(): Promise<readonly Sealed[]> {
    const read = await this.stub.history(reader);
    if (!read.ok) throw new Error(`no history of ${this.name}: ${read.reason}`);
    return read.value;
  }
  async entries(): Promise<Entry[]> { return (await this.sealed()).map((s) => s.entry); }
  async duties(): Promise<readonly Duty[]> {
    const read = await this.stub.outbox(reader);
    if (!read.ok) throw new Error(`no outbox of ${this.name}: ${read.reason}`);
    return read.value;
  }
  /** The state of item `id`, from the summary's live items. */
  async item(id: number) { return (await this.summary()).value.items.find((i) => i.id === id); }

  /** A grant of every action to every key of the fixture set. The test authority calls each current. */
  async grants(): Promise<Grant[]> {
    const at = await this.at();
    return Object.values(keys).map((who) => grantOf(who, at, Object.values(this.declared.acts).map((a) => a.grant)));
  }
  async intent(who: Actor, kind: string, over: Over = {}): Promise<SignedIntent> {
    const intent: Intent = { v: 1, to: await this.at(), actor: who.key, kind, on: null, expected: {}, fields: {}, idempotencyKey: `k${this.#keys++}`, notAfter: soon(60), ...over };
    return signIntent(intent, who.secret);
  }
  async act(who: Actor, kind: string, over: Over = {}): Promise<Answer> { return this.stub.submit(await this.intent(who, kind, over), await this.grants()); }
  /** An act that must be accepted. */
  async did(who: Actor, kind: string, over: Over = {}): Promise<Receipt> {
    const answer = await this.act(who, kind, over);
    if (answer.answer !== "accepted") throw new Error(`${kind} was not accepted: ${JSON.stringify(answer)}`);
    return answer.receipt;
  }

  /** The ticket that send `n` of this scope's entry `seq` creates: the object its seed names. */
  async created(seq: number, n = 0): Promise<Node> {
    const send = (await this.entries())[seq]!.sends.find((s) => s.n === n)!;
    return new Node(scopeIdOf(send.to as Seed), ticketDefinition.declared);
  }
  /** Send `n` of entry `seq`, as transport carries it. */
  async envelope(seq: number, n = 0): Promise<Delivered> {
    const { entry, hash } = (await this.sealed())[seq]!;
    const send = entry.sends.find((s) => s.n === n)!;
    return { to: send.to, from: { at: entry.at, seq, hash }, n, message: send.message };
  }

  /** Evict the object. Its storage stays; everything in memory is gone. */
  restart(): Promise<void> { return evictDurableObject(this.object); }
  /** Run the object's stored alarm now. False: none was stored. */
  alarm(): Promise<boolean> { return runDurableObjectAlarm(this.object); }
  /** The time the object's alarm is stored for, or null. */
  alarmAt(): Promise<number | null> { return runInDurableObject(this.object as unknown as DurableObjectStub<NetScope>, (_instance, state) => state.storage.getAlarm()); }
}

/**
 * Wait until no dispatcher of these scopes has anything to do now. Each
 * call joins the pass in flight or runs one; a round in which none made a
 * dispatch means all are quiet. It carries nothing.
 */
export async function settle(...nodes: readonly Node[]): Promise<void> {
  for (let made = 1; made > 0;) {
    made = 0;
    for (const node of nodes) made += await node.stub.dispatch();
  }
}

/** Move the shared clock on, and let the dispatchers do what is then due. */
export async function later(seconds: number, ...nodes: readonly Node[]): Promise<void> {
  net.clock.now = soon(seconds);
  await settle(...nodes);
}

/**
 * A desk founded by rita, with the declaration of the ticket its definition names in a `create`: the desk retains it,
 * and each ticket reads it from the desk. Transport is undisturbed from here on.
 */
export async function desk(): Promise<Node> {
  net.hold = net.deaf = null;
  const { signed, name } = founding(deskDefinition, { source: "a repository" });
  const node = new Node(name, deskDefinition.declared);
  const answer = await node.stub.found(signed, deskDefinition.declared, [ticketDefinition.declared]);
  if (answer.answer !== "accepted") throw new Error(`the desk was not founded: ${JSON.stringify(answer)}`);
  await settle(node);
  return node;
}

/** A ticket the desk creates for rita and confirms: its entry 0 is the genesis and its entry 1 the confirmation. */
export async function ticket(D: Node, title: string): Promise<Node> {
  const opened = await D.did(rita, "open-issue", { fields: { title } });
  const node = await D.created(opened.fact.seq);
  await settle(D, node);
  return node;
}
