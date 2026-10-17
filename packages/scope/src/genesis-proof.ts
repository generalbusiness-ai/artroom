/** Bounded immutable content evidence; callers still owe fresh read authority. */
import type { Entry, FactRef, FactUse, KeyId } from "@generalbusiness/dap-contract";
import { canonicalize, digestBytes, isFactRef, isFactUse, isKeyId, utf8 } from "@generalbusiness/artroom-bytes";
import { same } from "@generalbusiness/dap-derive";
import { CHAIN_STEPS, leads, rootOf, type Root } from "./signed-reads.ts";
import { ProofBytes, proofEntry, type ProofBody, type ProofSource } from "./proof-bytes.ts";
import type { PreparationRun } from "./preparation-flight.ts";

export const GENESIS_PROOF_BOUNDS = { steps: CHAIN_STEPS, bodies: 16, bytes: 1024 * 1024, attempts: 64, visits: 512, milliseconds: 10_000 } as const;
export type GenesisProof = { kind: "root"; of: FactRef; root: Root } | { kind: "none"; of: FactRef } | { kind: "unknown" };
export interface ProofTimer { now(): number; after(ms: number, work: () => void): () => void }
const realTimer: ProofTimer = { now: () => Date.now(), after(ms, work) { const timer = setTimeout(work, ms); return () => clearTimeout(timer); } };
interface Flight { id: string; ends: number; abandoned: boolean; answer: Promise<GenesisProof> }
const unknown = (): GenesisProof => ({ kind: "unknown" });
export interface GenesisProofWork {
  attempt(): void;
  visit(): void;
  /** Reserve the trusted exact receiver's work before dispatch. */
  peer(maxBytes: number, milliseconds: number): void;
}
const copy = (proof: GenesisProof): GenesisProof => proof.kind === "unknown" ? unknown() : {
  ...proof, of: { ...proof.of, at: { ...proof.of.at } }, ...(proof.kind === "root" ? { root: { ...proof.root } } : {}),
};

export class GenesisProofs {
  readonly #bytes: ProofBytes;
  readonly #source: ProofSource | null;
  readonly #timer: ProofTimer;
  #flight: Flight | null = null;
  // One minimal content result. Whole causal entries never survive the flight.
  #cache: { id: string; proof: GenesisProof } | null = null;
  constructor(bytes: ProofBytes, source: ProofSource | null, timer: ProofTimer = realTimer) { this.#bytes = bytes; this.#source = source; this.#timer = timer; }

  root(): Promise<GenesisProof> { return this.#root(); }

  /** A parent's one flight/deadline owns the real walk. No nested flight,
   * joining, timer reset or cross-operation cache read/write occurs here. */
  owned(own: FactRef, run: PreparationRun, work: GenesisProofWork): Promise<GenesisProof> {
    if (!isFactRef(own) || !run.active()) return Promise.resolve(unknown());
    return this.#run(own, run.active, work, run.remaining);
  }

  #root(deadline = Infinity): Promise<GenesisProof> {
    const began = this.#timer.now(), ends = Math.min(began + GENESIS_PROOF_BOUNDS.milliseconds, deadline);
    if (!Number.isFinite(began) || !Number.isFinite(ends)) return Promise.resolve(unknown());
    const own = this.#bytes.identity()?.genesis;
    if (!own || this.#timer.now() >= ends) return Promise.resolve(unknown());
    const id = canonicalize([1, own]); // helper and causal-policy version
    if (this.#flight) return this.#flight.id === id ? this.#flight.answer.then(copy) : Promise.resolve(unknown());
    if (this.#cache?.id === id) return Promise.resolve(copy(this.#cache.proof));
    let complete!: (proof: GenesisProof) => void;
    const answer = new Promise<GenesisProof>(resolve => { complete = resolve; });
    const flight: Flight = { id, ends, abandoned: false, answer };
    this.#flight = flight;
    const cancel = this.#timer.after(Math.max(0, ends - this.#timer.now()), () => { flight.abandoned = true; complete(unknown()); });
    void Promise.resolve().then(() => this.#run(own, () => !flight.abandoned && this.#timer.now() < flight.ends)).then(proof => {
      if (flight.abandoned || this.#timer.now() >= flight.ends) { complete(unknown()); return; }
      const current = this.#bytes.identity()?.genesis;
      if (flight.abandoned || this.#timer.now() >= flight.ends || !current || !same(current, own)) { complete(unknown()); return; }
      if (proof.kind !== "unknown") this.#cache = { id, proof: copy(proof) };
      complete(copy(proof));
    }, () => { complete(unknown()); }).finally(() => {
      cancel();
      // A caller timeout alone never releases unresolved source ownership.
      if (this.#flight === flight) this.#flight = null;
    });
    return answer.then(copy);
  }

  /** The callback must repeat the caller's exact request/window checks. */
  async eligible(request: () => { key: KeyId; since: number } | null): Promise<{ state: "positive" | "negative" | "unknown" }> {
    const began = this.#timer.now(), ends = began + GENESIS_PROOF_BOUNDS.milliseconds;
    if (!Number.isFinite(began) || !Number.isFinite(ends)) return { state: "unknown" };
    try {
      const first = request();
      if (!first || !isKeyId(first.key) || !Number.isFinite(first.since) || this.#timer.now() >= ends) return { state: "unknown" };
      // The content flight inherits this operation's remaining time. The
      // final metadata and fresh authority checks do not start a new budget.
      const proof = await this.#root(ends);
      if (proof.kind === "unknown" || this.#timer.now() >= ends) return { state: "unknown" };
      const current = this.#bytes.identity()?.genesis;
      if (!current || !same(proof.of, current) || this.#timer.now() >= ends) return { state: "unknown" };
      // No storage, await or other preparation follows this fresh check.
      const fresh = request();
      if (!fresh || !isKeyId(fresh.key) || first.key !== fresh.key || !Number.isFinite(fresh.since)) return { state: "unknown" };
      const state = proof.kind === "root" && leads(proof.root, fresh.key, fresh.since) ? "positive" : "negative";
      return { state: this.#timer.now() < ends ? state : "unknown" };
    } catch { return { state: "unknown" }; }
  }

  async #run(own: FactRef, isActive: () => boolean, meter?: GenesisProofWork, remainingMilliseconds?: () => number): Promise<GenesisProof> {
    let bodies = 0, bytes = 0, attempts = 0, visits = 0;
    const cache = new Map<string, { entry: Entry; content: string }>();
    const expected = new Map<string, string>();
    const locals = new Map<number, Entry>();
    const active = () => {
      if (!isActive()) throw new Error("proof-unavailable");
    };
    const attempt = () => { active(); if (++attempts > GENESIS_PROOF_BOUNDS.attempts) throw new Error("proof-unavailable"); meter?.attempt(); };
    const work = () => { active(); if (++visits > GENESIS_PROOF_BOUNDS.visits) throw new Error("proof-unavailable"); meter?.visit(); };
    const admit = (value: ProofBody, fact: FactRef, content?: string): Entry => {
      active();
      if (bodies >= GENESIS_PROOF_BOUNDS.bodies || typeof value.bytes !== "string" || value.bytes.length > GENESIS_PROOF_BOUNDS.bytes - bytes) throw new Error("proof-unavailable");
      const raw = utf8(value.bytes);
      if (raw.length > GENESIS_PROOF_BOUNDS.bytes - bytes) throw new Error("proof-unavailable");
      bodies++; bytes += raw.length;
      const entry = proofEntry(value, fact, raw.length, content as FactUse["content"] | undefined);
      if (!entry) throw new Error("proof-unavailable");
      cache.set(canonicalize(fact), { entry, content: digestBytes(raw) });
      if (same(fact.at, own.at)) locals.set(fact.seq, entry);
      return entry;
    };
    const ownEntry = (seq: number): Entry => {
      attempt();
      const cached = locals.get(seq);
      if (cached) return cached;
      if (bodies >= GENESIS_PROOF_BOUNDS.bodies) throw new Error("proof-unavailable");
      const read = this.#bytes.own(seq, GENESIS_PROOF_BOUNDS.bytes - bytes);
      if (read.kind !== "body" || !same(read.value.fact.at, own.at) || (seq === 0 && !same(read.value.fact, own))) throw new Error("proof-unavailable");
      return admit(read.value, read.value.fact);
    };
    const readUse = async (use: FactUse): Promise<Entry> => {
      attempt();
      if (!isFactUse(use)) throw new Error("proof-unavailable");
      const key = canonicalize(use.fact), prior = expected.get(key);
      if (prior !== undefined && prior !== use.content) throw new Error("proof-unavailable");
      expected.set(key, use.content);
      const cached = cache.get(key);
      if (cached) {
        if (cached.content !== use.content) throw new Error("proof-unavailable");
        return cached.entry;
      }
      if (bodies >= GENESIS_PROOF_BOUNDS.bodies) throw new Error("proof-unavailable");
      const remaining = GENESIS_PROOF_BOUNDS.bytes - bytes;
      if (same(use.fact.at, own.at)) {
        const entry = ownEntry(use.fact.seq), matched = cache.get(key);
        if (!matched || matched.content !== use.content) throw new Error("proof-unavailable");
        return entry;
      }
      const local = this.#bytes.retained(use, remaining);
      if (local.kind === "body") return admit(local.value, use.fact, use.content);
      if (local.kind !== "missing" || !this.#source) throw new Error("proof-unavailable");
      const milliseconds = remainingMilliseconds ? remainingTime() : undefined;
      if (milliseconds !== undefined) meter?.peer(remaining, milliseconds);
      active();
      const value = milliseconds === undefined ? await this.#source.read(use.fact, remaining) : await this.#source.read(use.fact, remaining, milliseconds);
      active(); // a late source never advances the walk or installs a cache
      if (!value) throw new Error("proof-unavailable");
      return admit(value, use.fact, use.content);
    };
    const remainingTime = (): number => {
      const milliseconds = remainingMilliseconds?.() ?? GENESIS_PROOF_BOUNDS.milliseconds;
      if (!Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > GENESIS_PROOF_BOUNDS.milliseconds) throw new Error("proof-unavailable");
      return milliseconds;
    };
    try {
      const start = ownEntry(0);
      if (start.input.type !== "genesis") return unknown();
      const root = await rootOf(start, readUse, GENESIS_PROOF_BOUNDS.steps, { scope: own.at.scope, entry: ownEntry }, work);
      active();
      return root === "unavailable" ? unknown() : root === null ? { kind: "none", of: own } : { kind: "root", of: own, root };
    } catch { return unknown(); }
  }
}
