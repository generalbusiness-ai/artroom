/** One receiver's read interpretation. The receiver's checked native birth
 * selects its policy, and all promotion proofs share that operation's budget. */
import type { FactRef, ScopeRef } from "@generalbusiness/dap-contract";
import { isEntryOf, type Fetched } from "@generalbusiness/dap-derive";
import { PartitionProofOperation, type PartitionProofPorts } from "./partition-proof.ts";
import type { Foreign, Resolver } from "./ports.ts";
import { producerName, receiverName } from "./receiver-facts.ts";

export class ReceiverReads implements Resolver {
  private constructor(readonly resolver: Resolver, readonly proof: PartitionProofOperation, readonly mode: "legacy" | "partition-v1") {}
  static async open(ports: PartitionProofPorts & { resolver: Resolver }, at: ScopeRef): Promise<ReceiverReads | null> {
    const proof = new PartitionProofOperation(ports), selected = await proof.receiver(at);
    return selected ? new ReceiverReads(ports.resolver, proof, selected.policy.mode) : null;
  }
  async #interpret<T extends { under: string }>(read: T, fact: FactRef): Promise<T | null> {
    const original = producerName(read);
    if (this.mode === "legacy" || original !== "declared:issue" && original !== "declared:change") return receiverName(read, original);
    const selected = await this.proof.declaredIdentity(fact);
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
