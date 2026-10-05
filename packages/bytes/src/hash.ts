/** SHA-256, synchronous, and the `Digest` text form (scope contract, section 2.1). */

import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import type { Digest } from "@generalbusiness/artroom-contract";
import { hex } from "./encode.ts";

export function sha256(bytes: Uint8Array): Uint8Array {
  return nobleSha256(bytes);
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
