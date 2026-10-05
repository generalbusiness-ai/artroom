/**
 * Ed25519 key IDs, signing and checking. One synchronous implementation, so a
 * signature is judged the same way in every runtime and can be checked
 * inside a storage transaction.
 */

import { ed25519 } from "@noble/curves/ed25519.js";
import type { Base64Url, KeyId } from "@generalbusiness/artroom-contract";
import { b64url, unb64url } from "./encode.ts";

/** `key_` + unpadded base64url of the 32-byte public key. */
export function keyIdOf(publicKey: Uint8Array): KeyId {
  if (publicKey.length !== 32) throw new Error("an Ed25519 public key has 32 bytes");
  return `key_${b64url(publicKey)}`;
}

/** The raw public key a key ID names, or null. */
export function publicKeyOf(key: unknown): Uint8Array | null {
  if (typeof key !== "string" || !/^key_[A-Za-z0-9_-]{43}$/.test(key)) return null;
  return unb64url(key.slice(4));
}

/** The key ID of a 32-byte Ed25519 secret. */
export function keyIdOfSecret(secret: Uint8Array): KeyId {
  return keyIdOf(ed25519.getPublicKey(secret));
}

/** Sign bytes. The caller builds them with a domain tag; see `domains.ts`. */
export function sign(secret: Uint8Array, bytes: Uint8Array): Base64Url {
  return b64url(ed25519.sign(bytes, secret));
}

/** True when `sig` is a valid Ed25519 signature by `key` over `bytes`. Malformed input is false. Never throws. */
export function verify(key: unknown, sig: unknown, bytes: Uint8Array): boolean {
  const pub = publicKeyOf(key);
  const raw = typeof sig === "string" ? unb64url(sig) : null;
  if (!pub || !raw || raw.length !== 64) return false;
  try {
    // RFC 8032 strict decoding: one verdict for each signature, whatever library checks it.
    return ed25519.verify(raw, bytes, pub, { zip215: false });
  } catch {
    return false;
  }
}
