/** One receiver's read interpretation. The receiver's checked native birth
 * selects its policy, and all promotion proofs share that operation's budget. */
import type { Digest, FactRef, Input, PlatformDefinition, ScopeRef } from "@generalbusiness/dap-contract";
import { isPlatformDefinition, isScopeRef, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { PARTITION_COHORT as C } from "@generalbusiness/dap-platform";
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
  async #interpret<T extends { under: string }>(read: T, fact: FactRef): Promise<T | null> {
    const original = producerName(read);
    if (this.mode === "legacy" || original !== "declared:issue" && original !== "declared:change") return receiverName(read, original);
    const selected = await this.proof?.declaredIdentity(fact);
    return selected ? receiverName(read, selected.under) : null;
  }
  async read(fact: FactRef, seconds: number, origin = false): Promise<Foreign> {
    const read = await this.resolver.read(fact, seconds, origin);
    if (read === null || !("entry" in read)) return read;
    if (!isEntryOf(read.entry, fact)) return null;
    return this.#interpret(read, fact);
  }
  /** A retained alias is checked metadata, never a receiver policy. Each use
   * derives its label again; the retained object and bytes stay unchanged. */
  async retained(facts: readonly Fetched[]): Promise<Fetched[] | null> {
    const interpreted = await Promise.all(facts.map(fact => isEntryOf(fact.entry, fact.fact) ? this.#interpret(fact, fact.fact) : null));
    return interpreted.every((fact): fact is Fetched => fact !== null) ? interpreted : null;
  }
}
