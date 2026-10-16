/** Invitation redemption proves possession without recording its private seed. */
import { INVITATION_PROOF_DOMAIN } from "@generalbusiness/dap-contract";
import type { Base64Url, KeyId, ScopeRef } from "@generalbusiness/dap-contract";
import { canonicalBytes } from "./canonical.ts";
import { isKeyId, isSignature } from "./ids.ts";
import { isScopeRef } from "./records.ts";
import { sign, verify } from "./sign.ts";
import { taggedBytes } from "./session.ts";

export { INVITATION_PROOF_DOMAIN } from "@generalbusiness/dap-contract";

/** The full incarnation, invitation item and joining key have one signed meaning. */
export function invitationProofBytes(scope: ScopeRef, invitation: number, joiningKey: KeyId): Uint8Array {
  if (!isScopeRef(scope) || scope.kind !== "membership" || !Number.isSafeInteger(invitation) || invitation < 1 || invitation > 1_000_000_000 || !isKeyId(joiningKey)) throw new Error("Invalid invitation proof subject.");
  return taggedBytes(INVITATION_PROOF_DOMAIN, canonicalBytes([scope, invitation, joiningKey]));
}

/** The seed remains private to the invitation handoff. */
export function signInvitationProof(seed: Uint8Array, scope: ScopeRef, invitation: number, joiningKey: KeyId): Base64Url {
  return sign(seed, invitationProofBytes(scope, invitation, joiningKey));
}

export function verifyInvitationProof(invitationKey: unknown, proof: unknown, scope: ScopeRef, invitation: number, joiningKey: KeyId): boolean {
  try { return isKeyId(invitationKey) && isSignature(proof) && verify(invitationKey, proof, invitationProofBytes(scope, invitation, joiningKey)); }
  catch { return false; }
}
