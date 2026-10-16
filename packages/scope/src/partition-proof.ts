/** Raw immutable partition birth evidence. No frame is a judged `Fetched`
 * identity: receiver policy must validate the complete chain separately. */
import type { FactRef, ScopeRef } from "@generalbusiness/dap-contract";
import { canonicalize, isFactRef, isScopeRef, utf8 } from "@generalbusiness/artroom-bytes";
import { isObject, same } from "@generalbusiness/dap-derive";
import { PARTITION_COHORT, PARTITION_IDENTITY_BOUNDS, type PartitionNativeFrame } from "@generalbusiness/dap-platform";
import type { NativeBirth, NativeBirthSource } from "./native-birth.ts";
import { readNativeBirth } from "./native-birth.ts";
import { PROOF_BYTE_BOUNDS, proofEntry, type ProofBody, type ProofSource } from "./proof-bytes.ts";
import { LATE, within } from "./turn.ts";

/** One total allowance, not an allowance per concern ancestor. A call reserves
 * its full admitted reply before I/O, even if it returns fewer bytes. Each
 * native birth also has the existing finite preparation/definition limits. */
export const PARTITION_PROOF_BOUNDS = Object.freeze({ frames: PARTITION_IDENTITY_BOUNDS.facts, calls: 16, bytes: 16 * PROOF_BYTE_BOUNDS.body, laneDepth: PARTITION_IDENTITY_BOUNDS.laneDepth, milliseconds: 10_000 });
export type RawPartitionFrame = PartitionNativeFrame;
export interface PartitionProof {
  frames: readonly RawPartitionFrame[];
  calls: number;
  reservedBytes: number;
}
export interface PartitionProofPorts {
  births: NativeBirthSource;
  proofs: ProofSource;
  /** A monotonic clock, with labelled deterministic ports in unit witnesses. */
  now?: () => number;
  wait?: <T>(work: () => Promise<T>, seconds: number) => Promise<T | typeof LATE>;
}

/** A new instance belongs to one admission/read operation. It caches only raw
 * frames for that operation, keyed by exact at/incarnation/sequence/hash. */
class Collection {
  readonly #frames = new Map<string, RawPartitionFrame>();
  readonly #positions = new Map<string, string>();
  readonly #births = new Map<string, NativeBirth>();
  readonly #now: () => number;
  readonly #wait: NonNullable<PartitionProofPorts["wait"]>;
  readonly #began: number;
  readonly #ends: number;
  #calls = 0;
  constructor(readonly ports: PartitionProofPorts) {
    this.#now = ports.now ?? (() => performance.now()); this.#wait = ports.wait ?? within;
    this.#began = this.#now(); this.#ends = this.#began + PARTITION_PROOF_BOUNDS.milliseconds;
  }
  #remaining(): number {
    const now = this.#now();
    return Number.isFinite(now) && now >= this.#began && Number.isFinite(this.#ends) ? Math.floor(this.#ends - now) : 0;
  }
  async #call<T>(work: (milliseconds: number) => Promise<T>): Promise<T | null> {
    const milliseconds = this.#remaining();
    if (milliseconds <= 0 || this.#calls >= PARTITION_PROOF_BOUNDS.calls
      || (this.#calls + 1) * PROOF_BYTE_BOUNDS.body > PARTITION_PROOF_BOUNDS.bytes) return null;
    this.#calls++;
    const got = await this.#wait(() => work(milliseconds), milliseconds / 1000);
    return got === LATE || this.#remaining() <= 0 ? null : got;
  }
  #keep(body: ProofBody, birth: NativeBirth): RawPartitionFrame | null {
    // Admit the raw envelope before decoding, even for a supplied protocol
    // port. The production sender separately admits it before materializing.
    if (typeof body?.bytes !== "string" || body.bytes.length > PROOF_BYTE_BOUNDS.body || utf8(body.bytes).length > PROOF_BYTE_BOUNDS.body) return null;
    const key = canonicalize(body.fact), position = canonicalize([body.fact.at, body.fact.seq]);
    const entry = proofEntry(body, body.fact, PROOF_BYTE_BOUNDS.body);
    if (!entry || !same(body.fact.at, birth.proof.fact.at)) return null;
    const previous = this.#frames.get(key);
    if (previous) return canonicalize(previous.entry) === body.bytes && previous.named === birth.named && previous.declarationName === birth.declarationName && previous.native === birth.native ? previous : null;
    if (this.#positions.has(position) || this.#frames.size >= PARTITION_PROOF_BOUNDS.frames) return null;
    const frame = { fact: body.fact, entry, named: birth.named, declarationName: birth.declarationName, native: birth.native };
    this.#positions.set(position, key); this.#frames.set(key, frame); return frame;
  }
  async birth(at: ScopeRef): Promise<NativeBirth | null> {
    if (!isScopeRef(at)) return null;
    const key = canonicalize(at), cached = this.#births.get(key);
    if (cached) return this.#remaining() > 0 ? cached : null;
    const reply = await this.#call(ms => this.ports.births.read(at, ms));
    const birth = readNativeBirth(reply, at);
    if (!birth || !this.#keep(birth.proof, birth)) return null;
    this.#births.set(key, birth); return birth;
  }
  async exact(fact: FactRef): Promise<RawPartitionFrame | null> {
    if (!isFactRef(fact)) return null;
    const key = canonicalize(fact), cached = this.#frames.get(key);
    if (cached) return this.#remaining() > 0 ? cached : null;
    const birth = await this.birth(fact.at);
    if (!birth) return null;
    if (fact.seq === 0) return same(fact, birth.proof.fact) ? this.#frames.get(key) ?? null : null;
    const body = await this.#call(ms => this.ports.proofs.read(fact, PROOF_BYTE_BOUNDS.body, ms));
    return body && same(body.fact, fact) ? this.#keep(body, birth) : null;
  }
  async lane(at: ScopeRef, depth = 1, seen = new Set<string>()): Promise<boolean> {
    const key = canonicalize(at);
    if (depth > PARTITION_PROOF_BOUNDS.laneDepth || seen.has(key)) return false;
    seen.add(key);
    const child = await this.birth(at), entry = child && proofEntry(child.proof, child.proof.fact, PROOF_BYTE_BOUNDS.body);
    if (!entry || entry.input.type !== "genesis" || !isFactRef(entry.input.source) || !isScopeRef(entry.input.seed.creator)
      || !same(entry.input.source.at, entry.input.seed.creator)) return false;
    const source = await this.exact(entry.input.source);
    if (!source) return false;
    const creator = entry.input.seed.creator;
    if (creator.kind === "lane") return this.lane(creator, depth + 1, seen);
    const part = await this.birth(creator), born = part && proofEntry(part.proof, part.proof.fact, PROOF_BYTE_BOUNDS.body);
    if (!part?.native || part.named !== PARTITION_COHORT.partition || !born || born.input.type !== "genesis"
      || !isFactRef(born.input.source) || !isScopeRef(born.input.seed.creator) || !same(born.input.source.at, born.input.seed.creator)
      || !born.input.message || !isObject(born.input.message.body) || !isObject(born.input.message.body["fields"])) return false;
    const root = await this.birth(born.input.seed.creator);
    if (!root?.native || root.named !== PARTITION_COHORT.directory || !await this.exact(born.input.source)) return false;
    const fields = born.input.message.body["fields"];
    for (const [name, pin] of [["membership", PARTITION_COHORT.membership], ["rules", PARTITION_COHORT.rules], ["destination", PARTITION_COHORT.destination]] as const) {
      const ref = fields[name]; if (!isScopeRef(ref)) return false;
      const sibling = await this.birth(ref); if (!sibling?.native || sibling.named !== pin) return false;
    }
    return true;
  }
  finish(): PartitionProof | null {
    return this.#remaining() > 0 ? { frames: [...this.#frames.values()], calls: this.#calls, reservedBytes: this.#calls * PROOF_BYTE_BOUNDS.body } : null;
  }
}

/** Collect the candidate's exact current fact, birth and finite creator chain.
 * A complete collection is still raw evidence. It conveys no native role or
 * receiver eligibility until the pure receiver policy validates it. */
export async function partitionProof(ports: PartitionProofPorts, from: FactRef): Promise<PartitionProof | null> {
  if (!isFactRef(from) || from.at.kind !== "lane") return null;
  try {
    const collection = new Collection(ports);
    return await collection.exact(from) && await collection.lane(from.at) ? collection.finish() : null;
  } catch { return null; }
}
