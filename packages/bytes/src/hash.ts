/** SHA-256, synchronous, and the `Digest` text form (scope contract, section 2.1). */

import { hmac } from "@noble/hashes/hmac.js";
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import { sha1 as nobleSha1 } from "@noble/hashes/legacy.js";
import type { Digest } from "@generalbusiness/artroom-contract";
import { hex } from "./encode.ts";

export function sha256(bytes: Uint8Array): Uint8Array {
  return nobleSha256(bytes);
}

/** SHA-1, for the names of Git objects in a repository that uses that object format. Never an Artroom entry digest. */
export function sha1(bytes: Uint8Array): Uint8Array {
  return nobleSha1(bytes);
}

/** HMAC-SHA-256 (RFC 2104), synchronous: the 32 bytes that authenticate `bytes` under `key`. A read session is checked with it. */
export function hmacSha256(key: Uint8Array, bytes: Uint8Array): Uint8Array {
  return hmac(nobleSha256, key, bytes);
}

/** `sha256:` + 64 lowercase hex characters, from the 32 hash bytes. */
export function digestOfHash(hash: Uint8Array): Digest {
  return `sha256:${hex(hash)}`;
}

/** The digest of raw bytes. */
export function digestBytes(bytes: Uint8Array): Digest {
  return digestOfHash(sha256(bytes));
}

export function isDigest(value: unknown): value is Digest {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}
