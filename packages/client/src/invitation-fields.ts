/** Exact cohort selection for private invitation handoff and public redemption. */
import { INVITATION_KEY_MEMBERSHIP } from "@generalbusiness/dap-contract";
import type { FieldValue, KeyId, ScopeRef } from "@generalbusiness/dap-contract";
import { b64url, isRecord, isSignature, keyIdOfSecret, signInvitationProof, textDigest, unb64url } from "@generalbusiness/artroom-bytes";

export { INVITATION_KEY_MEMBERSHIP } from "@generalbusiness/dap-contract";
const LEGACY = new Set(["platform:membership@1", "platform:membership@2", "platform:membership@4", "platform:membership@5"]);
export const usesInvitationKey = (definition: unknown): boolean => definition === INVITATION_KEY_MEMBERSHIP;
function privateSeed(secret: string): Uint8Array {
  const seed = unb64url(secret);
  if (!seed || seed.length !== 32 || b64url(seed) !== secret) throw new Error("Invalid private invitation seed.");
  return seed;
}
function supported(definition: string): void {
  if (!usesInvitationKey(definition) && !LEGACY.has(definition)) throw new Error("Unsupported invitation membership version.");
}
/** Only the new cohort's public key, or the exact legacy digest, enters an invitation act. */
export function invitationIssueFields(definition: string, secret: string): Record<string, FieldValue> {
  supported(definition);
  if (!usesInvitationKey(definition)) return { inviteHash: textDigest(secret) };
  const seed = privateSeed(secret);
  try { return { inviteKey: keyIdOfSecret(seed) }; }
  finally { seed.fill(0); }
}
export function invitationRedemptionFields(definition: string, scope: ScopeRef, invitation: number, joiningKey: KeyId, secret: string): Record<string, FieldValue> {
  supported(definition);
  if (!usesInvitationKey(definition)) return { invitation, secret };
  const seed = privateSeed(secret);
  try { return { invitation, proof: signInvitationProof(seed, scope, invitation, joiningKey) }; }
  finally { seed.fill(0); }
}
/** Custody shape only. Native membership still verifies the invitation signature and state. */
export function isInvitationRedemptionFields(definition: string, fields: unknown): boolean {
  if (!isRecord(fields) || !Number.isSafeInteger(fields["invitation"]) || Number(fields["invitation"]) < 1 || Number(fields["invitation"]) > 1_000_000_000) return false;
  const property = usesInvitationKey(definition) ? "proof" : "secret";
  if (!usesInvitationKey(definition) && !LEGACY.has(definition)) return false;
  return Object.keys(fields).length === 2 && Object.hasOwn(fields, property)
    && (property === "proof" ? isSignature(fields[property]) : typeof fields[property] === "string");
}
