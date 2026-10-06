/**
 * Test support for the checker service: STAND-INS, and entries made by
 * hand. Each proves only the boundary that it exposes, and every test that
 * uses one says so.
 *
 * - `MemoryDurable` stands for the service's durable storage. It keeps
 *   values in memory, with the two conditional writes that a real storage
 *   gives. It shows what the service does with its record, and nothing about
 *   a storage's durability or its loss.
 * - `Lane` stands for the scope namespace: one change lane and the rules
 *   scope of its repository. Its entries are made by hand, as a lane would
 *   seal them: no scope judged them. It answers a submitted act from a
 *   script, after it has checked the signature. It shows the service's side
 *   of each read and submit, and nothing about a lane's judgment.
 * - `ScriptedRunner` stands for a runner. It returns a stated end, and can
 *   hold a run open. It runs nothing. It shows the service's side only.
 *
 * The checker's key is made from random bytes in each test, so no source
 * file holds a secret.
 */

import type { Answer, Digest, Effect, Entry, FactRef, Grant, Input, ScopeRef, Sealed, SignedIntent } from "@generalbusiness/artroom-contract";
import { base32, canonicalize, entryHash, isEntry, keyIdOfSecret, sign, signIntent, timeOf, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { configurationDigest, type Configuration, type Durable, type Notice, type Outcome, type ResultSigner, type RunAsk, type Runner, type RunReport, type Scopes } from "../src/index.ts";

export const T0 = Date.UTC(2099, 0, 1);
const hex = (digit: string) => digit.repeat(40);
export const digest = (digit: string): Digest => `sha256:${digit.repeat(64)}`;
const ref = (kind: ScopeRef["kind"], n: number): ScopeRef => ({ kind, scope: `sc_${base32(new Uint8Array(32).fill(n))}`, inc: `in_${base32(new Uint8Array(16).fill(n))}` }) as ScopeRef;
export const lane = ref("lane", 1);
export const otherLane = ref("lane", 2);
const membership = ref("membership", 3);

/** A new key, from random bytes. `secret` is for a test to look for in what was written. */
export function newKey(): { secret: Uint8Array; signer: ResultSigner; signed: Uint8Array[] } {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const signed: Uint8Array[] = [];
  return { secret, signed, signer: { key: keyIdOfSecret(secret), sign: (bytes) => { signed.push(bytes); return sign(secret, bytes); } } };
}

export const configuration: Configuration = {
  name: "ci", image: digest("1"), environment: [{ name: "HOME", value: "/work/home" }, { name: "CI", value: "true" }],
  steps: [["npm", "ci"], ["npm", "test"]], judged: { passed: { status: 0, line: "ok" }, failed: { status: 1, line: "not ok" } }, limits: { seconds: 900, outputBytes: 1 << 20 },
};

/** A report of a run that judged: the image and the variables of the configuration, a confirmed checkout, and the judging step's end. */
export const report = (over: Partial<RunReport> = {}): RunReport => ({ started: true, image: configuration.image, environment: configuration.environment, checkout: true, steps: [{ status: 0, line: "added 1 package" }, { status: 0, line: "ok" }], end: "complete", ...over });

const sealed = (at: ScopeRef, seq: number, input: unknown, effects: Effect[]): Sealed => {
  const entry = { v: 1, at, seq, prev: digest("0"), time: timeOf(T0), clamped: false, epoch: 0, input: input as Input, uses: [], prepared: [], effects, sends: [] } satisfies Entry;
  if (!isEntry(entry)) throw new Error("the hand-made entry is not in the form of an entry");
  return { entry, hash: entryHash(entry) };
};

/** One job of the lane, made by hand: the manifest's entry at position 5 and the `request-check` entry at position 7, as the `change` lane writes them. */
export function world(over: { kind?: string; at?: ScopeRef; config?: Configuration } = {}) {
  const asker = newKey();
  const config = over.config ?? configuration;
  const tree = hex("7");
  const at = over.at ?? lane;
  const act = (kind: string, fields: Record<string, unknown>): Input => {
    const signed = signIntent({ v: 1, to: at, actor: asker.signer.key, kind, on: null, expected: {}, fields: fields as never, idempotencyKey: `k-${kind}`, notAfter: timeOf(T0 + 60_000) }, asker.secret);
    const grant: Grant = { issued: { at: membership, seq: 3, hash: digest("3") }, subject: { membership, member: "@una" as never }, key: asker.signer.key, principal: null, actions: ["change.propose"], within: at, notAfter: null, fresh: null as never };
    return { type: "act", signed, authority: [grant], presented: {} };
  };
  const manifest = sealed(at, 5, act("propose-manifest", {}), [
    { effect: "open", item: 5, type: "manifest", state: "current" },
    { effect: "value", item: 5, slot: "base", value: hex("b") }, { effect: "value", item: 5, slot: "integration", value: hex("c") }, { effect: "value", item: 5, slot: "tree", value: tree },
  ]);
  const deadline = timeOf(T0 + 1_800_000);
  const job = sealed(at, 7, act(over.kind ?? "request-check", { manifest: 5, name: config.name, configuration: configurationDigest(config) }), [
    { effect: "open", item: 7, type: "job", state: "requested" },
    { effect: "ref", item: 7, slot: "manifest", to: 5 },
    { effect: "value", item: 7, slot: "name", value: config.name }, { effect: "value", item: 7, slot: "tree", value: tree },
    { effect: "value", item: 7, slot: "configuration", value: configurationDigest(config) }, { effect: "value", item: 7, slot: "deadline", value: deadline },
  ]);
  const fact: FactRef = { at, seq: 7, hash: job.hash };
  const notice: Notice = { lane: at, job: fact, name: config.name, tree };
  return { manifest, job, fact, notice, tree, deadline, config };
}

export class MemoryDurable implements Durable {
  readonly kept = new Map<string, string>();
  create(key: string, value: string): Promise<boolean> { if (this.kept.has(key)) return Promise.resolve(false); this.kept.set(key, value); return Promise.resolve(true); }
  read(key: string): Promise<string | null> { return Promise.resolve(this.kept.get(key) ?? null); }
  replace(key: string, expected: string, next: string): Promise<boolean> { if (this.kept.get(key) !== expected) return Promise.resolve(false); this.kept.set(key, next); return Promise.resolve(true); }
}

const accepted = (signed: SignedIntent): Answer => ({ answer: "accepted", receipt: { fact: { at: signed.intent.to!, seq: 30, hash: digest("9") }, definition: digest("d"), intent: null, effects: [], sends: [], epoch: 0 } });
export const refusedFor = (name: string): Answer => ({ answer: "refused", reason: "guard-failed", name, judgedAt: { seq: 29, hash: digest("8") } });

/** The lane and the rules scope of one repository. Every call is written to `calls`, in order. */
export class Lane implements Scopes {
  readonly calls: string[] = [];
  readonly entries = new Map<number, Sealed>();
  pins: Digest | "platform:rules@1" | null = digest("d");
  definition: { name: string; state: string } | null = { name: "change", state: "active" };
  configurations = new Map<Digest, string>();
  state = "requested";
  /** The answers of the next submits, in order. With none left, a submit is accepted. `lost`: the lane admits the act and the answer does not arrive. */
  answers: (Answer | "lost")[] = [];
  /** The answer to the request for the read token. */
  token: Answer | null = null;
  readonly submitted: SignedIntent[] = [];
  readonly admitted = new Set<string>();
  readonly prepared: SignedIntent[] = [];

  constructor(w: ReturnType<typeof world>) {
    this.entries.set(5, w.manifest).set(7, w.job);
    this.configurations.set(configurationDigest(w.config), canonicalize(w.config));
  }
  entry(_lane: ScopeRef, seq: number) { this.calls.push(`entry ${seq}`); return Promise.resolve(this.entries.get(seq) ?? null); }
  pinned() { this.calls.push("pinned"); return Promise.resolve(this.pins); }
  activated() { this.calls.push("activated"); return Promise.resolve(this.definition); }
  configuration(of: Digest) { this.calls.push("configuration"); return Promise.resolve(this.configurations.get(of) ?? null); }
  standing(_lane: ScopeRef, _job: number, act: Outcome["act"]) { this.calls.push("standing"); return Promise.resolve({ state: this.state, expected: act === "check" ? { job: 1, rules: 1, proposal: 4 } : { job: 1, rules: 1 } }); }
  prepare(_lane: ScopeRef, signed: SignedIntent, capability: string, step: string) {
    this.calls.push(`prepare ${capability} ${step}`);
    if (!verifySignedIntent(signed)) throw new Error("the request for a step is not signed by its actor");
    this.prepared.push(signed);
    return Promise.resolve(this.token ?? accepted(signed));
  }
  submit(_lane: ScopeRef, signed: SignedIntent) {
    this.calls.push(`submit ${signed.intent.kind}`);
    if (!verifySignedIntent(signed)) throw new Error("the act is not signed by its actor");
    this.submitted.push(signed);
    // The exact bytes of an act that was admitted return its receipt and write nothing (section 6.3).
    if (this.admitted.has(signed.sig)) return Promise.resolve(accepted(signed));
    const next = this.answers.shift() ?? accepted(signed);
    if (next === "lost" || next.answer === "accepted") this.admitted.add(signed.sig);
    return next === "lost" ? Promise.reject(new Error("the answer was lost")) : Promise.resolve(next);
  }
}

export class ScriptedRunner implements Runner {
  readonly asked: RunAsk[] = [];
  /** What the next run returns at its end. A function is called with the ask. `lost`: the call rejects. */
  ends: unknown = report();
  /** When set, a run waits for `release()` before it ends. */
  hold: { promise: Promise<void>; release: () => void } | null = null;
  /** The runner's own records, by the run's name. */
  readonly records = new Map<string, unknown>();
  readonly looked: string[] = [];

  gate(): void { let release!: () => void; const promise = new Promise<void>((resolve) => { release = resolve; }); this.hold = { promise, release }; }
  async run(ask: RunAsk): Promise<unknown> {
    this.asked.push(ask);
    this.records.set(ask.run, "running");
    if (this.hold) await this.hold.promise;
    if (this.ends === "lost") { this.records.delete(ask.run); throw new Error(`the runner was lost: ${JSON.stringify(ask)}`); }
    this.records.set(ask.run, this.ends);
    return this.ends;
  }
  find(run: string): Promise<unknown | null> { this.looked.push(run); return Promise.resolve(this.records.get(run) ?? null); }
}
