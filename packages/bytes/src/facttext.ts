/**
 * A fact reference outside an entry (scope contract, section 3, "A fact
 * reference as text, and the digest of a fact"): its text, as a line of a
 * commit message holds it, and the name of a public ref that stands for it.
 * Each function is pure. A refusal is null: nothing is written or read in
 * part.
 *
 * Whose fact a rule may write is the rule's question, not this module's: a
 * rule builds a text or a name only from a fact that its scope holds as
 * verified. A reference with a true hash and another `at` has the same name
 * and another text.
 */

import type { Digest, FactRef } from "@generalbusiness/artroom-contract";
import { CanonicalError, canonicalize, parseStrict } from "./canonical.ts";
import { isDigest } from "./hash.ts";
import { isFactRef } from "./records.ts";

/** The longest text of a fact reference, in bytes: the kind `destination` at the position 9,007,199,254,740,991. Every byte is printable ASCII. */
export const FACT_TEXT_MOST = 237;

/**
 * The text of a fact reference: its RFC 8785 canonical JSON, and nothing
 * before or after it. One line, with no space: `at` with `inc`, `kind` and
 * `scope`, then `hash`, then `seq`. Null for a value that is no `FactRef`.
 */
export function factText(ref: unknown): string | null {
  // The guard of a record reads members, and the canonical writer reads a plain object's own enumerable keys. So a value may pass
  // the first and have no canonical bytes, or other ones: a position of negative zero, an object that is not plain, a required
  // member that is not enumerable. Each is refused here, and nothing is thrown. Negative zero is not written as zero. The text is
  // returned only when it reads back as a `FactRef` from its own bytes.
  if (!isFactRef(ref)) return null;
  let text: string;
  try {
    text = canonicalize(ref);
  } catch (e) {
    if (e instanceof CanonicalError) return null;
    throw e;
  }
  return factOfText(text) === null ? null : text;
}

/**
 * The fact reference that a text states, or null. The text is taken only as
 * the bytes that `factText` writes: text that is longer than the longest
 * reference, is not JSON of the profile, is no `FactRef`, has a member more
 * or less, or is the same value in other bytes (a space, another order of
 * members, a line feed after it) is refused.
 */
export function factOfText(text: unknown): FactRef | null {
  if (typeof text !== "string" || text.length > FACT_TEXT_MOST) return null;
  let value: unknown;
  try {
    value = parseStrict(text);
  } catch (e) {
    if (e instanceof CanonicalError) return null;
    throw e;
  }
  return isFactRef(value) && canonicalize(value) === text ? value : null;
}

const HASH = /^[0-9a-f]{64}$/;
// A component of a fixed part: the letters `a` to `z`, the digits and `-`, not empty and not beginning with `-`.
const PART = "[a-z0-9][a-z0-9-]*";
const BEFORE = new RegExp(`^refs/(${PART}/)*$`);
const AFTER = new RegExp(`^(/${PART})*$`);

/** The 64 lower-case hexadecimal characters of an entry hash: the digest without `sha256:`. Null for a value that is no digest. */
export function factHex(hash: unknown): string | null {
  return isDigest(hash) ? hash.slice("sha256:".length) : null;
}

/**
 * Whether `before` and `after` are the two fixed parts of a public ref name
 * that stands for a fact. `before` begins with `refs/` and ends with `/`.
 * `after` is empty, or begins with `/` and does not end with one. Each
 * holds only `a` to `z`, the digits, `-` and `/`, no `//`, and no component
 * that begins with `-`. No component of either is 64 hexadecimal
 * characters, so that a name holds the characters of one fact, once, and a
 * reader finds them by splitting the name at `/`.
 */
export function isFactRefParts(before: unknown, after: unknown): boolean {
  return typeof before === "string" && typeof after === "string" && BEFORE.test(before) && AFTER.test(after)
    && !`${before}${after}`.split("/").some((part) => HASH.test(part));
}

/**
 * The name of a public ref that stands for the fact whose entry hash is
 * `hash`: `before`, the 64 characters as one whole component, and `after`.
 * Null when the hash is no digest or the fixed parts are not of the form.
 */
export function factRefName(before: string, hash: unknown, after = ""): string | null {
  const hex = factHex(hash);
  return hex !== null && isFactRefParts(before, after) ? `${before}${hex}${after}` : null;
}

/**
 * The entry hash that a public ref name stands for, under the two fixed
 * parts of a version, or null: the name is exactly `before`, 64 lower-case
 * hexadecimal characters and `after`.
 */
export function factOfRefName(name: unknown, before: string, after = ""): Digest | null {
  if (typeof name !== "string" || !isFactRefParts(before, after)) return null;
  if (name.length !== before.length + 64 + after.length || !name.startsWith(before) || !name.endsWith(after)) return null;
  const hex = name.slice(before.length, before.length + 64);
  return HASH.test(hex) ? `sha256:${hex}` : null;
}
