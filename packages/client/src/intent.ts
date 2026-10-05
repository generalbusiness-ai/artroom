/**
 * Build and sign an intent (scope contract, sections 2.1 and 4.2). An
 * intent gets a fresh idempotency key and a `notAfter` within the intent
 * lifetime bound. The signature is over the intent in the `artroom-intent-1`
 * domain, by the key the intent names as its actor.
 *
 * A caller keeps the signed intent it submits. A retry is that same signed
 * intent, never a new one: the idempotency key is what makes an accepted
 * act answer with the same receipt.
 */

import { DOMAINS, PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Base64Url, FieldValue, Intent, KeyId, ScopeRef, SignedIntent, Timestamp } from "@generalbusiness/artroom-contract";
import { b64url, domainBytes, keyIdOf, keyIdOfSecret, sign } from "@generalbusiness/artroom-bytes";

/** Signs bytes as one Ed25519 key. It gives out the key's ID and signatures, and never the private key. */
export interface Signer {
  readonly key: KeyId;
  /** The signature over `bytes`, as unpadded base64url of its 64 bytes. */
  sign(bytes: Uint8Array): Base64Url | Promise<Base64Url>;
}

/** A signer over a 32-byte Ed25519 secret the caller already holds, as a key file or a test does. */
export function secretSigner(secret: Uint8Array): Signer {
  return { key: keyIdOfSecret(secret), sign: (bytes) => sign(secret, bytes) };
}

/**
 * A signer over a new key that WebCrypto makes and keeps. The key is not
 * extractable, so no code can read it, here or anywhere: it signs for as
 * long as this value is held, and is gone with it.
 */
export async function webCryptoSigner(): Promise<Signer> {
  const subtle = crypto.subtle as unknown as Subtle;
  const pair = (await subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"])) as { publicKey: unknown; privateKey: unknown };
  const key = keyIdOf(new Uint8Array(await subtle.exportKey("raw", pair.publicKey)));
  return { key, sign: async (bytes) => b64url(new Uint8Array(await subtle.sign({ name: "Ed25519" }, pair.privateKey, bytes))) };
}

/** The WebCrypto calls used above, in this file's own terms, so that it reads the same under every runtime's types. */
interface Subtle {
  generateKey(algorithm: { name: string }, extractable: boolean, usages: readonly string[]): Promise<unknown>;
  exportKey(format: "raw", key: unknown): Promise<ArrayBuffer>;
  sign(algorithm: { name: string }, key: unknown, data: Uint8Array): Promise<ArrayBuffer>;
}

/** A fresh idempotency key: 16 random bytes, as 22 base64url characters. */
export function newIdempotencyKey(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(16)));
}

/** What the caller asks for. `to` is null only when founding a repository. */
export interface Asked {
  to: ScopeRef | null;
  kind: string;
  /** The item the act is on, by its local ID. */
  on?: number | null;
  /** The revision of each item the act names. */
  expected?: Record<string, number>;
  fields?: Record<string, FieldValue>;
}

export interface Signing {
  /** The signing time, in milliseconds. The default is the runtime's clock. */
  now?: number;
  /** How long the intent stays admissible. The default is five minutes. */
  lifetimeSeconds?: number;
  /** The scope's intent lifetime bound. The default is the contract's proposed bound. */
  maxLifetimeSeconds?: number;
  /** Only to sign again an intent whose key the caller kept. The default is a fresh key. */
  idempotencyKey?: string;
}

/** The lifetime an intent gets when the caller names none: well inside the bound, so that two clocks may differ. */
export const DEFAULT_LIFETIME_SECONDS = 5 * 60;

/** Whole seconds, in the one form a timestamp has (section 5.3). */
const timestamp = (ms: number): Timestamp => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");

/** An intent by `signer`, with a fresh idempotency key and a `notAfter` within the bound, signed. */
export async function signedIntent(signer: Signer, asked: Asked, signing: Signing = {}): Promise<SignedIntent> {
  const bound = signing.maxLifetimeSeconds ?? PROPOSED_BOUNDS.intentLifetimeSeconds;
  const lifetime = signing.lifetimeSeconds ?? Math.min(DEFAULT_LIFETIME_SECONDS, bound);
  if (!(lifetime > 0 && lifetime <= bound)) throw new RangeError(`an intent lives more than 0 and at most ${bound} seconds`);
  const intent: Intent = {
    v: 1, to: asked.to, actor: signer.key, kind: asked.kind, on: asked.on ?? null, expected: asked.expected ?? {}, fields: asked.fields ?? {},
    idempotencyKey: signing.idempotencyKey ?? newIdempotencyKey(), notAfter: timestamp((signing.now ?? Date.now()) + lifetime * 1000),
  };
  return { intent, sig: await signer.sign(domainBytes(DOMAINS.intent, intent)) };
}
