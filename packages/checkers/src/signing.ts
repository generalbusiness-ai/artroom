/**
 * Signing envelopes with the checker service's delegation key (R-SIG-1,
 * R-EXEC-5). The key is an Ed25519 private key held as a Worker secret, in
 * JWK form. It never enters a runner sandbox.
 *
 * The bytes signed are `artroom-envelope-v1`, a newline, and the RFC 8785
 * canonical JSON of the envelope. The key's ID is `key_` and the base64url
 * of its 32-byte public key (R-ID-4).
 */

import type { Envelope, KeyId, SignedEnvelope, SigningDomain } from "@generalbusiness/artroom-contract";
import { canonicalize } from "@generalbusiness/artroom-policy";

/** An Ed25519 key pair as JWK. `d` is the private part: keep it in a secret. */
export interface Ed25519Jwk {
  readonly kty: "OKP";
  readonly crv: "Ed25519";
  readonly x: string;
  readonly d?: string;
}

export interface Signer {
  readonly key: KeyId;
  sign(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array>;
}

const enc = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** The bytes an envelope's signature covers (R-SIG-1). */
export function signingBytes(domain: SigningDomain, value: unknown): Uint8Array<ArrayBuffer> {
  return new Uint8Array(enc.encode(`${domain}\n${canonicalize(value as never)}`));
}

/** Make a new key pair, for setup and tests. */
export async function generateKey(): Promise<Ed25519Jwk> {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as unknown as { privateKey: Parameters<typeof crypto.subtle.exportKey>[1] };
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as { x?: string; d?: string };
  if (!jwk.x || !jwk.d) throw new Error("key export failed");
  return { kty: "OKP", crv: "Ed25519", x: jwk.x, d: jwk.d };
}

/** A signer from the secret JWK (a JSON string). */
export async function importSigner(secret: string): Promise<Signer> {
  const jwk = JSON.parse(secret) as Ed25519Jwk;
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || !jwk.d || fromB64url(jwk.x).length !== 32) throw new Error("not an Ed25519 private JWK");
  const key = await crypto.subtle.importKey("jwk", { ...jwk, ext: false }, { name: "Ed25519" }, false, ["sign"]);
  return {
    key: `key_${jwk.x}` as KeyId,
    sign: async (bytes) => new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, bytes)),
  };
}

export async function signEnvelope<E extends Envelope>(signer: Signer, envelope: E): Promise<SignedEnvelope<E>> {
  if (envelope.actor !== signer.key) throw new Error("the envelope's actor is not the signing key");
  return { envelope, sig: b64url(await signer.sign(signingBytes("artroom-envelope-v1", envelope))) };
}

/** Verify a signed envelope against its `actor` key (R-SIG-5). */
export async function verifyEnvelope(signed: SignedEnvelope): Promise<boolean> {
  const actor = signed.envelope.actor;
  if (!/^key_[A-Za-z0-9_-]{43}$/.test(actor)) return false;
  const pub = await crypto.subtle.importKey("raw", fromB64url(actor.slice(4)), { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify({ name: "Ed25519" }, pub, fromB64url(signed.sig), signingBytes("artroom-envelope-v1", signed.envelope));
}
