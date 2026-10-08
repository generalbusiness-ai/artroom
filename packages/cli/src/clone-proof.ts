/** Check read-token receipt and entry evidence before any private handoff.
 * This is the client's exact-envelope/full-fact check, not history replay. */
import type { Input, OperationId, PlatformDefinition, Receipt, ScopeRef, Sealed, SignedIntent, Summary } from "@generalbusiness/artroom-contract";
import { canonicalize, factRefOf, intentDigest, isPlatformDefinition, isReceipt, isRecord, isSealed, timeMs, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";

export interface ReadTokenProof { to: ScopeRef; definition: PlatformDefinition; signed: SignedIntent; receipt: Receipt; operation: OperationId }
export function readTokenReceipt(receipt: Receipt, summary: Pick<Summary, "scope" | "definition">, signed: SignedIntent): ReadTokenProof | null {
  try {
    if (!isReceipt(receipt) || !isPlatformDefinition(summary.definition) || !verifySignedIntent(signed) || summary.scope.kind !== "destination" || signed.intent.kind !== "read-token" || signed.intent.on === null || receipt.fact.seq < 1
      || canonicalize(signed.intent.to) !== canonicalize(summary.scope) || canonicalize(receipt.fact.at) !== canonicalize(summary.scope)
      || receipt.definition !== summary.definition || receipt.intent !== intentDigest(signed.intent)) return null;
    return { to: summary.scope, definition: summary.definition, signed, receipt, operation: `${receipt.fact.seq}:0` };
  } catch { return null; }
}

/** Like the exact join read: recompute the full fact and compare the service's
 * advertised hash as well. A correct hash does not excuse a different scope. */
export function readTokenEntry(sealed: Sealed, at: ScopeRef, seq: number): boolean {
  try {
    return isSealed(sealed) && sealed.entry.seq === seq && canonicalize(sealed.entry.at) === canonicalize(at) && factRefOf(sealed.entry).hash === sealed.hash;
  } catch { return false; }
}

export function readTokenOpening(sealed: Sealed, proof: ReadTokenProof): boolean {
  try {
    const { entry } = sealed;
    if (!readTokenEntry(sealed, proof.to, proof.receipt.fact.seq) || canonicalize(factRefOf(entry)) !== canonicalize(proof.receipt.fact) || entry.input.type !== "act"
      || canonicalize(entry.input.signed) !== canonicalize(proof.signed) || entry.epoch !== proof.receipt.epoch || canonicalize(entry.effects) !== canonicalize(proof.receipt.effects)
      || canonicalize(entry.sends.map((send) => `${entry.seq}.${send.n}`)) !== canonicalize(proof.receipt.sends)) return false;
    const operations = entry.effects.filter((effect) => effect.effect === "operation");
    const attempts = entry.effects.filter((effect) => effect.effect === "attempt");
    return operations.length === 1 && operations[0]!.k === 0 && operations[0]!.owner === proof.definition && operations[0]!.kind === "mint-read" && operations[0]!.attempts === 1 && operations[0]!.for === proof.signed.intent.on
      && attempts.length === 1 && attempts[0]!.attempt === 1 && attempts[0]!.result === "opened"
      && (attempts[0]!.operation === proof.operation || canonicalize(attempts[0]!.operation) === canonicalize({ k: 0 }));
  } catch { return false; }
}

export function readTokenOutcome(sealed: Sealed, seq: number, proof: ReadTokenProof): boolean {
  try {
    if (!readTokenEntry(sealed, proof.to, seq) || seq <= proof.receipt.fact.seq) return false;
    const input = sealed.entry.input;
    if (input.type !== "outcome" || input.operation !== proof.operation || input.owner !== proof.definition || input.kind !== "mint-read" || input.attempt !== 1 || input.evidence.basis !== (input.result === "unknown" ? "none" : "own-answer")) return false;
    const attempt = sealed.entry.effects.filter((effect) => effect.effect === "attempt");
    if (attempt.length !== 1 || attempt[0]!.operation !== proof.operation || attempt[0]!.attempt !== 1 || attempt[0]!.result !== input.result) return false;
    return readTokenBody(input);
  } catch { return false; }
}

/** The already-specified mint-read outcome body, including unknown/refused.
 * Its expiry is parsed, never inferred or compared to a new deadline. */
function readTokenBody(input: Extract<Input, { type: "outcome" }>): boolean {
  const body = input.evidence.body;
  if (!isRecord(body)) return false;
  const fields = Object.keys(body);
  if (input.result !== "confirmed") return fields.length === 0;
  return fields.length === 2 && Object.hasOwn(body, "token") && Object.hasOwn(body, "ends") && typeof body["token"] === "string" && body["token"].length > 0 && utf8(body["token"]).length <= 256 && timeMs(body["ends"]) !== null;
}
