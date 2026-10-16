/** Bounded raw birth metadata. This supplies no derived identity or read grant. */
import type { Digest, PlatformDefinition, ScopeRef } from "@generalbusiness/dap-contract";
import { isDigest, isFactRef, isPlatformDefinition, isScopeRef, scopeIdOf, utf8, wellFormed } from "@generalbusiness/artroom-bytes";
import { same } from "@generalbusiness/dap-derive";
import { PreparationBudget } from "./preparation-budget.ts";
import type { ReadPreparation } from "./read-preparation.ts";
import { PROOF_BYTE_BOUNDS, proofEntry, type ProofBody } from "./proof-bytes.ts";

export interface NativeBirth {
  v: 1;
  proof: ProofBody;
  named: Digest | PlatformDefinition;
  declarationName: string;
  native: boolean;
}
export interface NativeBirthSource { read(at: ScopeRef, milliseconds: number, maxBytes?: number): Promise<NativeBirth | null> }
/** Admit the closed wire view before parsing its entry bytes. Native execution
 * still relies on the trusted one-namespace sender, as exact proof reads do. */
export function readNativeBirth(value: unknown, at: ScopeRef, maxBytes: number = PROOF_BYTE_BOUNDS.body): NativeBirth | null {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > PROOF_BYTE_BOUNDS.body) return null;
  if (!value || typeof value !== "object" || Object.keys(value).sort().join() !== "declarationName,named,native,proof,v") return null;
  const got = value as NativeBirth;
  if (got.v !== 1 || !(isDigest(got.named) || isPlatformDefinition(got.named)) || got.native !== isPlatformDefinition(got.named)
    || typeof got.declarationName !== "string" || !wellFormed(got.declarationName) || got.declarationName.length > 256 || utf8(got.declarationName).length > 256
    || !got.proof || !isFactRef(got.proof.fact) || got.proof.fact.seq !== 0 || !same(got.proof.fact.at, at)
    || typeof got.proof.bytes !== "string" || got.proof.bytes.length > maxBytes) return null;
  const entry = proofEntry(got.proof, got.proof.fact, maxBytes);
  return entry?.input.type === "genesis" && entry.prev === null && (entry.input.decision === "applied" || entry.input.decision === "refused") && entry.input.seed.definition === got.named && scopeIdOf(entry.input.seed) === at.scope
    && entry.input.inc === at.inc && entry.input.seed.kind === at.kind ? got : null;
}

/** The existing preparation owns pre-parse metadata/genesis/definition
 * admission and exact current code support. No legacy source() call or
 * retained/derived under label is involved. */
export function nativeBirth(preparation: ReadPreparation, at: unknown, budget: PreparationBudget = new PreparationBudget(), maxBytes: number = PROOF_BYTE_BOUNDS.body): NativeBirth | null {
  if (!isScopeRef(at) || !Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > PROOF_BYTE_BOUNDS.body) return null;
  const captured = preparation.birth(budget, maxBytes);
  if (!captured || !same(captured.scope.at, at) || !captured.pinned.definition || !budget.available) return null;
  const name = captured.pinned.definition.declared.name;
  if (typeof name !== "string" || name.length > 256 || utf8(name).length > 256) return null;
  return { v: 1, proof: captured.birth, named: captured.pinned.named, declarationName: name, native: captured.pinned.platform !== null };
}
