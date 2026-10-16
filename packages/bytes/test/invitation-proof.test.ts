import { expect, test } from "vitest";
import { b64url, keyIdOfSecret, newIncarnation, signInvitationProof, verifyInvitationProof } from "../src/index.ts";
import type { ScopeRef } from "@generalbusiness/dap-contract";

// Invariant: an invitation signature is useful only for its exact membership
// incarnation, invitation item and joining key; the private seed is not a proof.
test("invitation proofs cannot be reused for another key, invitation or scope incarnation", () => {
  const seed = new Uint8Array(32).fill(73), actor = keyIdOfSecret(new Uint8Array(32).fill(74));
  const scope = { scope: `sc_${"a".repeat(52)}`, inc: newIncarnation(new Uint8Array(16).fill(75)), kind: "membership" } as ScopeRef;
  const key = keyIdOfSecret(seed), proof = signInvitationProof(seed, scope, 4, actor);
  expect(verifyInvitationProof(key, proof, scope, 4, actor)).toBe(true);
  expect(verifyInvitationProof(key, proof, scope, 4, keyIdOfSecret(new Uint8Array(32).fill(76)))).toBe(false);
  expect(verifyInvitationProof(key, proof, scope, 5, actor)).toBe(false);
  expect(verifyInvitationProof(key, proof, { ...scope, inc: newIncarnation(new Uint8Array(16).fill(77)) }, 4, actor)).toBe(false);
  expect(verifyInvitationProof(key, proof, { ...scope, scope: `sc_${"b".repeat(52)}` } as ScopeRef, 4, actor)).toBe(false);
  expect(verifyInvitationProof(key, b64url(seed), scope, 4, actor)).toBe(false);
});
