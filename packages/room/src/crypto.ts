/**
 * Hashes, keys and signatures (R-ID-3, R-ID-4, R-ID-7, R-SIG-1).
 *
 * - SHA-256 and Ed25519 signing are synchronous (@noble), so the room can
 *   seal an entry and sign its hash inside one SQLite transaction with no
 *   `await` (R-ADM-6, R-LOG-2).
 * - Verifying a caller's signature uses WebCrypto (RFC 8032, strict). It is
 *   asynchronous and runs before admission starts (R-ADM-1 step 2).
 */

import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import type { Base64Url, Digest, KeyId, SigningDomain } from "@generalbusiness/artroom-contract";
import { canonicalBytes, utf8 } from "./canonical.ts";

const HEX = "0123456789abcdef";

export function hex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += HEX[b >> 4]! + HEX[b & 15]!;
  return out;
}

export function sha256Bytes(bytes: Uint8Array): Uint8Array {
  return sha256(bytes);
}

export function sha256Hex(bytes: Uint8Array): string {
  return hex(sha256(bytes));
}

/** `sha256:` + hex of raw bytes (R-ID-7, for files and secrets). */
export function digestBytes(bytes: Uint8Array): Digest {
  return `sha256:${sha256Hex(bytes)}`;
}

/** `sha256:` + hex of the canonical bytes of a JSON value (R-ID-7). */
export function digestJson(value: unknown): Digest {
  return digestBytes(canonicalBytes(value));
}

// ------------------------------------------------------------ base64url

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

/** Unpadded base64url (RFC 4648 section 5). */
export function b64url(bytes: Uint8Array): Base64Url {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]!;
  }
  return out;
}

/** Decode unpadded base64url. Returns null for anything else, including non-canonical trailing bits. */
export function unb64url(s: string): Uint8Array | null {
  if (s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (const c of s) {
    const v = B64_INDEX.get(c);
    if (v === undefined) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  if (bits > 0 && (acc & ((1 << bits) - 1)) !== 0) return null;
  return out.subarray(0, o);
}

// ------------------------------------------------------------ keys

/** `key_` + base64url of the 32-byte public key (R-ID-4). */
export function keyIdOf(publicKey: Uint8Array): KeyId {
  return `key_${b64url(publicKey)}`;
}

/** The raw public key named by a key ID, or null. */
export function publicKeyOf(key: string): Uint8Array | null {
  if (!/^key_[A-Za-z0-9_-]{43}$/.test(key)) return null;
  const raw = unb64url(key.slice(4));
  return raw && raw.length === 32 ? raw : null;
}

export interface KeyPair {
  readonly key: KeyId;
  /** The 32-byte Ed25519 secret seed. Never recorded, logged or returned (R-SEC-5). */
  readonly seed: Uint8Array;
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

export function keyPairFromSeed(seed: Uint8Array): KeyPair {
  return { key: keyIdOf(ed25519.getPublicKey(seed)), seed };
}

export function newKeyPair(): KeyPair {
  return keyPairFromSeed(randomBytes(32));
}

/** A random opaque token: 32 bytes, base64url. Used for secrets, bearers and sessions. */
export function randomToken(): string {
  return b64url(randomBytes(32));
}

/** HMAC-SHA256, for deriving a room key from the Worker's secret. */
export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  return hmac(sha256, key, message);
}

// ------------------------------------------------------------ signatures

/** Domain tag, newline, then the payload bytes (R-SIG-1). */
export function signingBytes(domain: SigningDomain, payload: Uint8Array): Uint8Array {
  const tag = utf8(`${domain}\n`);
  const out = new Uint8Array(tag.length + payload.length);
  out.set(tag, 0);
  out.set(payload, tag.length);
  return out;
}

/** The payload for an object: its canonical bytes (R-SIG-2). For entries, the hash string as UTF-8. */
export function payloadOf(domain: SigningDomain, value: unknown): Uint8Array {
  return domain === "artroom-entry-v1" ? utf8(value as string) : canonicalBytes(value);
}

/** Sign synchronously. The seed never leaves this module's caller. */
export function sign(seed: Uint8Array, domain: SigningDomain, value: unknown): Base64Url {
  return b64url(ed25519.sign(signingBytes(domain, payloadOf(domain, value)), seed));
}

let subtleEd25519: Promise<boolean> | null = null;

/** Whether this host's WebCrypto supports Ed25519, probed once with a known-good key. */
function hasSubtleEd25519(): Promise<boolean> {
  subtleEd25519 ??= (async () => {
    try {
      const probe = ed25519.getPublicKey(new Uint8Array(32).fill(7));
      await crypto.subtle.importKey("raw", probe, { name: "Ed25519" }, false, ["verify"]);
      return true;
    } catch {
      return false;
    }
  })();
  return subtleEd25519;
}

/**
 * Verify an Ed25519 signature by key ID. Uses WebCrypto (strict RFC 8032)
 * where available, otherwise @noble with ZIP-215 off. Never throws.
 */
export async function verify(key: string, domain: SigningDomain, value: unknown, sig: string): Promise<boolean> {
  const pub = publicKeyOf(key);
  const raw = unb64url(sig);
  if (!pub || !raw || raw.length !== 64) return false;
  let message: Uint8Array;
  try {
    message = signingBytes(domain, payloadOf(domain, value));
  } catch {
    return false;
  }
  try {
    if (await hasSubtleEd25519()) {
      const k = await crypto.subtle.importKey("raw", pub, { name: "Ed25519" }, false, ["verify"]);
      return await crypto.subtle.verify({ name: "Ed25519" }, k, raw, message);
    }
    return ed25519.verify(raw, message, pub, { zip215: false });
  } catch {
    return false;
  }
}
