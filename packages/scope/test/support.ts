/**
 * What every workerd test of the scope shares: one definition, built from
 * derive's fixture lane; a founded scope on real Durable Object storage,
 * with the controls the test steers it by; and short forms for its acts.
 */

import { env } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Answer, Bounds, Entry, Grant, Head, Intent, Read, Receipt, ScopeId, ScopeRef, Seed, SignedIntent, Timestamp } from "@generalbusiness/artroom-contract";
import { intentDigest, scopeIdOf, signIntent } from "@generalbusiness/artroom-bytes";
import { timeMs, timeOf, type ValidDefinition } from "@generalbusiness/artroom-derive";
import { grantOf, keys, lane, variant, type Actor, type Over } from "@generalbusiness/artroom-derive/testing";
import { READ_BOUNDS, type ReadBounds, type Sealed, type Summary } from "../src/index.ts";
import { controls, type Controls } from "../src/testing.ts";
import type { TestScope } from "./worker.ts";

export const { rita, una, vic } = keys;

/** The test clock starts far ahead of the real one, so no stored alarm fires by itself: a test runs each alarm. */
export const START = "2099-01-01T00:00:00Z";
/** `seconds` after the start. */
export const at = (seconds: number): Timestamp => timeOf(timeMs(START)! + seconds * 1000);
/** How long a hold of the fixture lane lasts. */
export const HOLD = 600;

/**
 * Derive's fixture lane, with room for four live holds, a rule on `assign`
 * (the requester may not assign themselves), a fact that a remark may
 * name, and a report that awaits its acceptance (section 17.2, row 3). A directory is founded under it: the kind of a scope is in its seed,
 * and no form of this definition reads it.
 */
export const definition = variant(lane, (def) => {
  def.items.hold.max = 4;
  def.rules["not-self"] = "fields.performer.member != signer.member";
  def.acts.assign.guards.push({ rule: "not-self" });
  def.acts.remark.fields.proof = { type: "fact", kind: ["assign"], under: "lane", required: false };
  def.acts["accept-report"].settles = { of: "on", in: ["reported"] };
});
const actions = Object.values(definition.declared.acts).map((a) => a.grant);

/** Any value: the test readers port lets every reader read. */
export const reader = "a test reader";

/** A founding intent signed by rita, the seed it asks for, and the name of the object that holds that scope. `under`: the definition, when it is not the one above. */
export function founding(notAfter: Timestamp = at(60), under: ValidDefinition = definition): { signed: SignedIntent; seed: Seed; name: ScopeId } {
  const intent: Intent = { v: 1, to: null, actor: rita.key, kind: "found", on: null, expected: {}, fields: { title: "A lane", opener: rita.member }, idempotencyKey: crypto.randomUUID(), notAfter };
  const seed: Seed = { v: 1, kind: "directory", definition: under.digest, creator: null, cause: intentDigest(intent), ordinal: 0 };
  return { signed: signIntent(intent, rita.secret), seed, name: scopeIdOf(seed) };
}

/** The object's surface as a caller over RPC has it: each method, answered in a promise. */
type Surface = Pick<TestScope, "found" | "submit" | "prepare" | "settle" | "checkpoint" | "summary" | "items" | "history" | "entry" | "outbox">;
export type Remote = { [K in keyof Surface]: (...args: Parameters<Surface[K]>) => Promise<Awaited<ReturnType<Surface[K]>>> };

/** The object with that name, for the pool's own functions: eviction, the alarm, a look at its storage. */
export const objectOf = (name: string, namespace: DurableObjectNamespace = env.SCOPES): DurableObjectStub => namespace.get(namespace.idFromName(name));
export const stubOf = (name: string, namespace?: DurableObjectNamespace): Remote => objectOf(name, namespace) as unknown as Remote;

/** One founded scope: entry 0 opened intent 0, requested by rita. */
export class Lane {
  #keys = 0;
  constructor(readonly name: ScopeId, readonly c: Controls, readonly at: ScopeRef, readonly genesis: Receipt, readonly signed: SignedIntent) {}

  /** A new stub each time: after a restart the old one is broken. */
  get stub(): Remote { return stubOf(this.name); }
  get object(): DurableObjectStub { return objectOf(this.name); }

  /** An intent to this scope with a new idempotency key, admissible for a minute from the test clock's `now`. */
  intent(who: Actor, kind: string, over: Over = {}): SignedIntent {
    const intent: Intent = { v: 1, to: this.at, actor: who.key, kind, on: null, expected: {}, fields: {}, idempotencyKey: `k${this.#keys++}`, notAfter: timeOf(timeMs(this.c.clock.now)! + 60_000), ...over };
    return signIntent(intent, who.secret);
  }
  /** A grant of every action to every key of the fixture set. The test authority calls each current. */
  grants(): Grant[] { return Object.values(keys).map((who) => grantOf(who, this.at, actions)); }
  submit(signed: SignedIntent, grants: Grant[] = this.grants()): Promise<Answer> { return this.stub.submit(signed, grants); }
  act(who: Actor, kind: string, over: Over = {}): Promise<Answer> { return this.submit(this.intent(who, kind, over)); }
  /** An act that must be accepted. */
  async did(who: Actor, kind: string, over: Over = {}): Promise<Receipt> {
    const answer = await this.act(who, kind, over);
    if (answer.answer !== "accepted") throw new Error(`${kind} was not accepted: ${JSON.stringify(answer)}`);
    return answer.receipt;
  }
  /** A commitment offered by rita and assigned to una: two entries. Its ID is returned; its revision is 2. */
  async commitment(): Promise<number> {
    const id = (await this.did(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } })).fact.seq;
    await this.did(rita, "assign", { on: id, expected: { on: 1 }, fields: { performer: una.member } });
    return id;
  }
  /** A hold by una under a new commitment: three entries. It ends `HOLD` seconds after the clock's `now`. */
  async hold(): Promise<number> {
    const commitment = await this.commitment();
    return (await this.did(una, "take-hold", { fields: { commitment }, expected: { commitment: 2 } })).fact.seq;
  }
  /** `count` holds with one deadline. */
  async holds(count: number): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 0; i < count; i++) ids.push(await this.hold());
    return ids;
  }
  /** Short forms of the acts most tests need. */
  offer(): SignedIntent { return this.intent(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } }); }
  remark(text = "a remark"): SignedIntent { return this.intent(rita, "remark", { on: 0, fields: { text } }); }

  async summary(): Promise<Extract<Read<Summary>, { ok: true }>> {
    const read = await this.stub.summary(reader);
    if (!read.ok) throw new Error(`no summary: ${read.reason}`);
    return read;
  }
  async head(): Promise<Head> { return (await this.summary()).at; }
  /** The number of items of that type in that state, from the summary's exact counts. */
  async count(type: string, state: string): Promise<number | undefined> {
    return (await this.summary()).value.counts.find(([t, s]) => t === type && s === state)?.[2];
  }
  /** The entries from `seq` on, each with its hash, as one history page gives them. */
  async sealed(seq = 0): Promise<readonly Sealed[]> {
    const read = await this.stub.history(reader, String(seq));
    if (!read.ok) throw new Error(`no history: ${read.reason}`);
    return read.value;
  }
  async entries(seq = 0): Promise<Entry[]> { return (await this.sealed(seq)).map((sealed) => sealed.entry); }

  /** Evict the object. Its storage stays; everything in memory is gone. */
  async restart(): Promise<void> { await evictDurableObject(this.object); }
  /** Run the object's stored alarm now. False: none was stored. */
  alarm(): Promise<boolean> { return runDurableObjectAlarm(this.object); }
  /** Inside the object, with its real storage and the instance in memory. */
  inside<R>(work: (state: DurableObjectState, instance: object) => R | Promise<R>): Promise<R> {
    return runInDurableObject(this.object as unknown as DurableObjectStub<TestScope>, (instance, state) => work(state, instance));
  }
  /** The time the object's alarm is stored for, or null. */
  alarmAt(): Promise<number | null> { return this.inside((state) => state.storage.getAlarm()); }
}

/** Found a scope on real storage, with its clock at the start. `bounds` and `reads` replace the defaults for this scope only. `under`: a variant of the definition above, with the same grants. */
export async function found(bounds: Partial<Bounds> = {}, reads: Partial<ReadBounds> = {}, under: ValidDefinition = definition): Promise<Lane> {
  const { signed, name } = founding(at(60), under);
  const c = controls(name, START);
  c.bounds = { ...PROPOSED_BOUNDS, ...bounds };
  c.reads = { ...READ_BOUNDS, ...reads };
  const answer = await stubOf(name).found(signed, under.declared);
  if (answer.answer !== "accepted") throw new Error(`the scope was not founded: ${JSON.stringify(answer)}`);
  return new Lane(name, c, answer.receipt.fact.at, answer.receipt, signed);
}
