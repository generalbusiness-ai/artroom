import { expect, test } from "vitest";
import type { Entry, Receipt, Sealed, SignedIntent } from "@generalbusiness/artroom-contract";
import { entryHash, factRefOf, intentDigest, keyIdOfSecret, newIncarnation, signIntent } from "@generalbusiness/artroom-bytes";
import { waitOutcome } from "../src/clone-outcome.ts";
import { readTokenEntry, readTokenOpening, readTokenOutcome, readTokenReceipt } from "../src/clone-proof.ts";

// STAND-INS: summary, admitted entries and receipts are written by hand. No
// catalog data, scope, membership, judgment, provider or clone runs. Signatures
// and full entry hashes use the real bytes package at this client boundary.
function fixture() {
  const secret = new Uint8Array(32).fill(7);
  const to = { scope: `sc_${"a".repeat(52)}` as const, kind: "destination" as const, inc: newIncarnation(new Uint8Array(16).fill(8)) };
  const definition = "platform:destination@99" as const;
  const signed: SignedIntent = signIntent({ v: 1, to, actor: keyIdOfSecret(secret), kind: "read-token", on: 0, expected: { on: 0 }, fields: { hours: 1 }, idempotencyKey: "scripted", notAfter: "2026-10-08T11:01:00Z" }, secret);
  const entry: Entry = { v: 1, at: to, seq: 7, prev: `sha256:${"a".repeat(64)}`, time: "2026-10-08T11:00:00Z", clamped: false, epoch: 0, input: { type: "act", signed, authority: [], presented: {} }, uses: [], prepared: [], sends: [], effects: [
    { effect: "operation", k: 0, owner: definition, kind: "mint-read", attempts: 1, for: 0 },
    { effect: "attempt", operation: { k: 0 }, attempt: 1, result: "opened", selected: null },
  ] };
  const sealed = (entry: Entry): Sealed => ({ entry, hash: entryHash(entry) });
  const receipt: Receipt = { fact: factRefOf(entry), definition, intent: intentDigest(signed.intent), effects: entry.effects, sends: [], epoch: 0 };
  const summary = { scope: to, definition };
  const proof = readTokenReceipt(receipt, summary, signed)!;
  const result = (result: "confirmed" | "refused" | "unknown"): Entry => ({ ...entry, seq: 8, prev: entryHash(entry), input: { type: "outcome", operation: proof.operation, owner: definition, kind: "mint-read", attempt: 1, result, evidence: { basis: result === "unknown" ? "none" : "own-answer", body: result === "confirmed" ? { token: "nonsecret-handle", ends: "2026-10-08T13:00:00Z" } : {} } }, effects: [{ effect: "attempt", operation: proof.operation, attempt: 1, result, selected: null }] });
  return { secret, to, definition, signed, entry, sealed, receipt, summary, proof, result };
}

// Invariant: accepted metadata must name this exact envelope/full destination,
// and the entry at its valid fact must actually contain that signed act and
// its recorded mint-read opening; metadata cannot substitute another act.
test("read-token proof rejects a foreign accepted receipt and a real old act paired with the new request's intent metadata", () => {
  const f = fixture();
  expect(f.proof).not.toBeNull();
  expect(readTokenOpening(f.sealed(f.entry), f.proof)).toBe(true);
  const foreign = { ...f.receipt, fact: { ...f.receipt.fact, at: { ...f.to, inc: newIncarnation(new Uint8Array(16).fill(9)) } } };
  expect(readTokenReceipt(foreign, f.summary, f.signed)).toBeNull();
  const oldSigned = signIntent({ ...f.signed.intent, fields: { hours: 2 }, idempotencyKey: "earlier" }, f.secret);
  expect(readTokenReceipt({ ...f.receipt, intent: intentDigest(oldSigned.intent) }, f.summary, f.signed)).toBeNull();
  const oldEntry: Entry = { ...f.entry, input: { type: "act", signed: oldSigned, authority: [], presented: {} } };
  const mixed = readTokenReceipt({ ...f.receipt, fact: factRefOf(oldEntry) }, f.summary, f.signed)!;
  expect(mixed).not.toBeNull(); // Its receipt shape and intent metadata are valid.
  expect(readTokenOpening(f.sealed(oldEntry), mixed)).toBe(false); // Its actual admitted signature is for the old request.
  const otherOpening: Entry = { ...f.entry, effects: [{ effect: "operation", k: 0, owner: f.definition, kind: "mint", attempts: 1, for: 0 }, f.entry.effects[1]!] };
  const wrongOperation = readTokenReceipt({ ...f.receipt, fact: factRefOf(otherOpening), effects: otherOpening.effects }, f.summary, f.signed)!;
  expect(readTokenOpening(f.sealed(otherOpening), wrongOperation)).toBe(false);
});

// Invariant: a self-consistent hash does not make a cached foreign outcome or
// another owner/kind/attempt the accepted operation's outcome. Legitimate
// unknown/refused remain actionable stops and never provide a handle.
test("read-token proof binds outcome full facts and operation identity while admitting the real unknown/refused evidence forms", async () => {
  const f = fixture();
  const confirmed = f.result("confirmed");
  expect(readTokenOutcome(f.sealed(confirmed), 8, f.proof)).toBe(true);
  const foreign: Entry = { ...confirmed, at: { ...f.to, scope: `sc_${"b".repeat(51)}a` } };
  expect(readTokenEntry(f.sealed(foreign), f.to, 8)).toBe(false);
  expect(readTokenEntry(f.sealed(confirmed), f.to, 9)).toBe(false);
  expect(readTokenEntry({ entry: confirmed, hash: `sha256:${"b".repeat(64)}` }, f.to, 8)).toBe(false);
  const input = confirmed.input;
  if (input.type !== "outcome") return expect.fail("fixture is an outcome");
  const otherOperation: Entry = { ...confirmed, input: { ...input, owner: "platform:membership@1", kind: "mint", attempt: 2 } };
  expect(readTokenEntry(f.sealed(otherOperation), f.to, 8)).toBe(true);
  expect(readTokenOutcome(f.sealed(otherOperation), 8, f.proof)).toBe(false);
  expect(readTokenOutcome(f.sealed(f.result("unknown")), 8, f.proof)).toBe(true);
  expect(readTokenOutcome(f.sealed(f.result("refused")), 8, f.proof)).toBe(true);
  let reads = 0;
  const unknown = f.sealed(f.result("unknown"));
  const stopped = await waitOutcome(f.proof.operation, 8, async () => { reads++; return { ok: true, at: { seq: 8, hash: unknown.hash }, complete: true, value: unknown }; }, async () => {}, 2);
  expect(stopped).toMatchObject({ ok: true, next: 9, scanned: 1, outcome: { result: "unknown", evidence: { basis: "none", body: {} } } });
  expect(reads).toBe(1); // The first unknown stops; it is not skipped to seek a later success.
  const unicode: Entry = { ...confirmed, input: { ...input, evidence: { basis: "own-answer", body: { token: "é".repeat(128), ends: "2026-10-08T13:00:00Z" } } } };
  expect(readTokenOutcome(f.sealed(unicode), 8, f.proof)).toBe(true); // Exactly 256 UTF-8 bytes, not an ASCII-only handle policy.
  expect(readTokenOutcome(f.sealed({ ...unicode, input: { ...input, evidence: { basis: "own-answer", body: { token: "é".repeat(129), ends: "2026-10-08T13:00:00Z" } } } }), 8, f.proof)).toBe(false);
});
