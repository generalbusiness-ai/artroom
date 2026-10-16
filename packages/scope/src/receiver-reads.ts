/** One receiver's read interpretation. The receiver's checked native birth
 * selects its policy, and all promotion proofs share that operation's budget. */
import type { DeclaredDefinition, Digest, Entry, FactRef, Input, PlatformDefinition, ScopeRef } from "@generalbusiness/dap-contract";
import { isPlatformDefinition, isScopeRef, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { PARTITION_COHORT as C, partitionPublicationOrigin, type PartitionCreation } from "@generalbusiness/dap-platform";
import { isEntryOf, isObject, type Fetched } from "@generalbusiness/dap-derive";
import { PartitionProofOperation, type PartitionProofPorts } from "./partition-proof.ts";
import type { Foreign, Ports, Resolver } from "./ports.ts";
import { producerName, receiverName } from "./receiver-facts.ts";

export class ReceiverReads implements Resolver {
  private constructor(readonly resolver: Resolver, readonly proof: PartitionProofOperation | null, readonly mode: "legacy" | "partition-v1") {}
  static async open(ports: PartitionProofPorts & { resolver: Resolver }, at: ScopeRef): Promise<ReceiverReads | null> {
    const proof = new PartitionProofOperation(ports), selected = await proof.receiver(at);
    return selected ? new ReceiverReads(ports.resolver, proof, selected.policy.mode) : null;
  }
  /** The local pin/genesis are read by Scope from its own admitted store.
   * A known older native pin, or a declaration without a directory locator,
   * cannot belong to this factory. Positive selection still needs full proof. */
  static async forReceiver(ports: Pick<Ports, "resolver" | "proofs" | "births">, at: ScopeRef, named: Digest | PlatformDefinition, birth: Extract<Input, { type: "genesis" }>): Promise<ReceiverReads | null> {
    if (birth.decision !== "applied" || birth.inc !== at.inc || birth.seed.definition !== named || scopeIdOf(birth.seed) !== at.scope) return null;
    const candidate = isPlatformDefinition(named)
      ? [C.directory, C.partition, C.membership, C.rules, C.destination, C.inbox].some(pin => pin === named)
      : isObject(birth.message?.body) && isScopeRef(birth.message.body["directory"]);
    if (!candidate) return new ReceiverReads(ports.resolver, null, "legacy");
    if (!ports.births || !ports.proofs) return null;
    return ReceiverReads.open({ resolver: ports.resolver, births: ports.births, proofs: ports.proofs }, at);
  }
  static async probeCreation(ports: Pick<Ports, "resolver" | "proofs" | "births">, creation: PartitionCreation): Promise<{ operation?: PartitionProofOperation; source?: Entry } | null> {
    const named = creation.seed.definition;
    const possible = isPlatformDefinition(named)
      ? [C.directory, C.partition, C.membership, C.rules, C.destination, C.inbox].some(pin => pin === named)
      : isObject(creation.message.body) && isScopeRef(creation.message.body["directory"]);
    if (!possible) return {};
    if (!ports.births || !ports.proofs) return null;
    const operation = new PartitionProofOperation({ births: ports.births, proofs: ports.proofs });
    const candidate = await operation.creationCandidate(creation);
    if (candidate === null) return null;
    if (!candidate) return { operation };
    const source = await operation.raw(creation.source);
    return source ? { operation, source: source.entry } : null;
  }
  static async forCreation(ports: Pick<Ports, "resolver" | "proofs" | "births">, creation: PartitionCreation, definition: DeclaredDefinition | PlatformDefinition, operation?: PartitionProofOperation): Promise<ReceiverReads | null> {
    const candidate = typeof definition === "string"
      ? [C.directory, C.partition, C.membership, C.rules, C.destination, C.inbox].some(pin => pin === definition)
      : isObject(creation.message.body) && isScopeRef(creation.message.body["directory"]);
    if (!candidate) return new ReceiverReads(ports.resolver, null, "legacy");
    if (!ports.births || !ports.proofs) return null;
    const proof = operation ?? new PartitionProofOperation({ births: ports.births, proofs: ports.proofs }), selected = await proof.bootstrap(creation, definition);
    return selected ? new ReceiverReads(ports.resolver, proof, selected.policy.mode) : null;
  }
  async publication(from: FactRef, root: ScopeRef, destination: ScopeRef, kind: "application" | "change"): Promise<boolean | null> {
    if (this.mode !== "partition-v1" || !this.proof) return null;
    const proof = await this.proof.lane(from);
    return proof ? partitionPublicationOrigin(from, root, destination, kind, proof.frames) : null;
  }
  async #interpret(read: Fetched): Promise<Fetched | null> {
    if (this.mode === "legacy") return receiverName(read, producerName(read));
    const selected = await this.proof?.source(read.fact);
    return selected ? receiverName({ ...read, under: selected.producer }, selected.under) : null;
  }
  async read(fact: FactRef, seconds: number, origin = false): Promise<Foreign> {
    if (this.mode === "partition-v1") {
      const selected = await this.proof?.source(fact);
      return selected ? receiverName({ entry: selected.source.entry, under: selected.producer }, selected.under) : null;
    }
    const read = await this.resolver.read(fact, seconds, origin);
    return read !== null && "entry" in read && !isEntryOf(read.entry, fact) ? null : read;
  }
  /** A retained alias is checked metadata, never a receiver policy. Each use
   * derives its label again; the retained object and bytes stay unchanged. */
  async retained(facts: readonly Fetched[]): Promise<Fetched[] | null> {
    const interpreted = await Promise.all(facts.map(fact => isEntryOf(fact.entry, fact.fact) ? this.#interpret(fact) : null));
    return interpreted.every((fact): fact is Fetched => fact !== null) ? interpreted : null;
  }
}
