/**
 * Digests, with WebCrypto only (R-EVAL-7). atseq hashed installed files
 * through Node's filesystem; workerd has no filesystem, so Artroom pins the
 * engine by version and a behavioural fingerprint (evaluator.ts), and uses
 * the functions here for every digest it records.
 */

import type { Digest, Json, RepoPath, Sha } from "@generalbusiness/artroom-contract";
import { canonicalJson } from "./values.ts";

const HEX = "0123456789abcdef";

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // The cast satisfies both this package's Web declarations and Node's, whose `digest` wants an ArrayBuffer-backed view.
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
  let out = "";
  for (const byte of digest) out += HEX[byte >> 4]! + HEX[byte & 15]!;
  return out;
}

/** Canonical JSON of profile values. For safe integers and well-formed strings this is RFC 8785. */
export function canonicalize(value: Json): string {
  return canonicalJson(value, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
}

/** `sha256:` + hex of the canonical JSON bytes. Used for decision inputs (R-POL-11). */
export async function digestJson(value: Json): Promise<Digest> {
  return `sha256:${await sha256Hex(new TextEncoder().encode(canonicalize(value)))}`;
}

/** One file in a filtered snapshot: path, git mode (for example `100644`) and blob SHA. */
export type SnapshotEntry = readonly [path: RepoPath, mode: string, blob: Sha];

const encoder = new TextEncoder();
function compareUtf8(a: string, b: string): number {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return x.length - y.length;
}

/**
 * The filtered snapshot digest (R-CARRY-9): SHA-256 of the canonical JSON
 * array of `[path, mode, blob]` triples, sorted by the path's UTF-8 bytes.
 */
export async function snapshotDigest(entries: readonly SnapshotEntry[]): Promise<Digest> {
  const sorted = [...entries].sort((a, b) => compareUtf8(a[0], b[0]));
  return digestJson(sorted.map(([path, mode, blob]) => [path, mode, blob]));
}
