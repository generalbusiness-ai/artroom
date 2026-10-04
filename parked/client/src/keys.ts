/**
 * Ed25519 keys and signatures with WebCrypto only (R-SIG-1, R-ID-4). The
 * same code runs in Workers, Node 22+ and current browsers.
 */

import type { Base64Url, KeyId, Signer, SigningDomain } from "@generalbusiness/artroom-contract";
import { canonicalize } from "./canonical.ts";
import { artroomError } from "./errors.ts";

// ---------------------------------------------------------------- base64url

export function toBase64Url(bytes: Uint8Array): Base64Url {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw artroomError("bad-request", "Not base64url text.");
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** `n` random bytes as base64url. */
export function randomToken(n: number): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(n)));
}

/** A fresh idempotency key: 22 characters from `[A-Za-z0-9_-]` (R-ID-10). */
export function newIdempotencyKey(): string {
  return randomToken(16);
}

// --------------------------------------------------------------------- keys

/** `key_` + unpadded base64url of the 32-byte public key (R-ID-4). */
export function keyIdOf(publicKey: Uint8Array): KeyId {
  if (publicKey.length !== 32) throw artroomError("bad-request", "An Ed25519 public key has 32 bytes.");
  return `key_${toBase64Url(publicKey)}`;
}

export function publicKeyOf(key: KeyId): Uint8Array {
  if (!/^key_[A-Za-z0-9_-]{43}$/.test(key)) throw artroomError("bad-request", `Not a key ID: ${key}.`);
  return fromBase64Url(key.slice(4));
}

/** An Ed25519 private key as a JWK. This is what a key file stores. */
export interface PrivateJwk {
  readonly kty: "OKP";
  readonly crv: "Ed25519";
  readonly x: Base64Url;
  readonly d: Base64Url;
}

function signerFor(key: KeyId, privateKey: CryptoKey): Signer {
  return {
    key,
    async sign(bytes: Uint8Array): Promise<Uint8Array> {
      return new Uint8Array(await crypto.subtle.sign("Ed25519", privateKey, bytes as BufferSource));
    },
  };
}

/**
 * Makes a new key. The browser default keeps it non-extractable, so it never
 * leaves WebCrypto. Pass `extractable: true` to also get the JWK, for a key file.
 */
export async function generateSigner(opts: { readonly extractable?: boolean } = {}): Promise<{ signer: Signer; jwk?: PrivateJwk }> {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, opts.extractable === true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const signer = signerFor(keyIdOf(raw), pair.privateKey);
  if (opts.extractable !== true) return { signer };
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  // Re-import so the signer itself holds a non-extractable key.
  return { signer: await signerFromJwk(jwk as PrivateJwk), jwk: { kty: "OKP", crv: "Ed25519", x: jwk.x!, d: jwk.d! } };
}

/** A signer from a stored private JWK. The imported key is non-extractable. */
export async function signerFromJwk(jwk: PrivateJwk): Promise<Signer> {
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || typeof jwk.d !== "string" || typeof jwk.x !== "string") {
    throw artroomError("bad-request", "The key file does not hold an Ed25519 private key.");
  }
  const privateKey = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: jwk.x, d: jwk.d }, { name: "Ed25519" }, false, ["sign"]);
  return signerFor(keyIdOf(fromBase64Url(jwk.x)), privateKey);
}

// ------------------------------------------------------------------ signing

const encoder = new TextEncoder();

/** The bytes signed: the domain tag, a newline, then the canonical bytes (R-SIG-1). */
export function signingBytes(domain: SigningDomain, value: unknown): Uint8Array {
  return encoder.encode(`${domain}\n${canonicalize(value)}`);
}

export async function signValue(domain: SigningDomain, value: unknown, signer: Signer): Promise<Base64Url> {
  const sig = await signer.sign(signingBytes(domain, value));
  if (sig.length !== 64) throw artroomError("internal", "An Ed25519 signature has 64 bytes.");
  return toBase64Url(sig);
}

/** Checks a signature from the key ID alone (R-ID-4). */
export async function verifyValue(domain: SigningDomain, value: unknown, sig: Base64Url, key: KeyId): Promise<boolean> {
  try {
    const publicKey = await crypto.subtle.importKey("raw", publicKeyOf(key) as BufferSource, { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", publicKey, fromBase64Url(sig) as BufferSource, signingBytes(domain, value) as BufferSource);
  } catch {
    return false;
  }
}
