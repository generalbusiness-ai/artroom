/**
 * Hashes, keys and signatures (R-ID-3, R-ID-4, R-ID-7, R-SIG-1), synchronous
 * through @noble, the same libraries the Room uses.
 */

import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type { Base64Url, Digest, KeyId, SigningDomain } from "@generalbusiness/artroom-contract";
import { canonicalBytes, utf8 } from "./canonical.ts";

const HEX = "0123456789abcdef";

export function hex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += HEX[b >> 4]! + HEX[b & 15]!;
  return out;
}

export function sha256Hex(bytes: Uint8Array): string {
  return hex(sha256(bytes));
}

/** `sha256:` + hex of raw bytes. */
export function digestBytes(bytes: Uint8Array): Digest {
  return `sha256:${sha256Hex(bytes)}`;
}

/** `sha256:` + hex of the canonical bytes of a JSON value (R-ID-7). */
export function digestJson(value: unknown): Digest {
  return digestBytes(canonicalBytes(value));
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

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

export function unb64url(s: string): Uint8Array | null {
  if (s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (const c of s) {
    const v = B64_INDEX.get(c);
    if (v === undefined) return null;
    acc = ((acc << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  if (bits > 0 && (acc & ((1 << bits) - 1)) !== 0) return null;
  return out.subarray(0, o);
}

export function keyIdOf(publicKey: Uint8Array): KeyId {
  return `key_${b64url(publicKey)}`;
}

export function publicKeyOf(key: string): Uint8Array | null {
  if (!/^key_[A-Za-z0-9_-]{43}$/.test(key)) return null;
  const raw = unb64url(key.slice(4));
  return raw && raw.length === 32 ? raw : null;
}

export interface KeyPair {
  readonly key: KeyId;
  readonly seed: Uint8Array;
}

export function keyPairFromSeed(seed: Uint8Array): KeyPair {
  return { key: keyIdOf(ed25519.getPublicKey(seed)), seed };
}

/** Domain tag, newline, then the payload bytes (R-SIG-1). */
export function signingBytes(domain: SigningDomain, value: unknown): Uint8Array {
  const payload = domain === "artroom-entry-v1" ? utf8(value as string) : canonicalBytes(value);
  const tag = utf8(`${domain}\n`);
  const out = new Uint8Array(tag.length + payload.length);
  out.set(tag, 0);
  out.set(payload, tag.length);
  return out;
}

export function sign(seed: Uint8Array, domain: SigningDomain, value: unknown): Base64Url {
  return b64url(ed25519.sign(signingBytes(domain, value), seed));
}

/** True when `sig` is a valid Ed25519 signature by `key` over the signing bytes. Never throws. */
export function verifySig(key: string, sig: string, domain: SigningDomain, value: unknown): boolean {
  const pub = publicKeyOf(key);
  const raw = unb64url(sig);
  if (!pub || !raw || raw.length !== 64) return false;
  try {
    // RFC 8032 strict decoding, as WebCrypto verifies in the Room (R-SIG-1).
    return ed25519.verify(raw, signingBytes(domain, value), pub, { zip215: false });
  } catch {
    return false;
  }
}
