/**
 * The byte domains (scope contract, section 2.1). Every digest and
 * signature is over a domain tag, one newline byte, and the canonical JSON of
 * one value. No value contains its own digest.
 */

import { DOMAINS } from "@generalbusiness/artroom-contract";
import type { DeclaredDefinition, DeliveryCause, Digest, DomainTag, Entry, FactRef, Incarnation, Intent, Message, ScopeId, Seed, SignedIntent } from "@generalbusiness/artroom-contract";
import { canonicalBytes, utf8 } from "./canonical.ts";
import { base32, unbase32 } from "./encode.ts";
import { digestOfHash, sha256 } from "./hash.ts";
import { sign, verify } from "./sign.ts";

/** The UTF-8 tag, one newline byte, then the canonical JSON of the value. */
export function domainBytes(tag: DomainTag, value: unknown): Uint8Array {
  const head = utf8(`${tag}\n`);
  const body = canonicalBytes(value);
  const out = new Uint8Array(head.length + body.length);
  out.set(head, 0);
  out.set(body, head.length);
  return out;
}

const digest = (tag: DomainTag, value: unknown): Digest => digestOfHash(sha256(domainBytes(tag, value)));

/** Over the intent, not the signature. The same intent, retried, has the same digest. */
export function intentDigest(intent: Intent): Digest {
  return digest(DOMAINS.intent, intent);
}

export function signIntent(intent: Intent, secret: Uint8Array): SignedIntent {
  return { intent, sig: sign(secret, domainBytes(DOMAINS.intent, intent)) };
}

/** True when the signature is by `intent.actor` over the intent. Anything malformed is false. Never throws. */
export function verifySignedIntent(signed: SignedIntent): boolean {
  try {
    return verify(signed.intent.actor, signed.sig, domainBytes(DOMAINS.intent, signed.intent));
  } catch {
    return false;
  }
}

export function seedDigest(seed: Seed): Digest {
  return digest(DOMAINS.seed, seed);
}

/** `sc_` + the 52 base32 characters of the 32 bytes of the seed's digest. */
export function scopeIdOf(seed: Seed): ScopeId {
  return `sc_${base32(sha256(domainBytes(DOMAINS.seed, seed)))}`;
}

/** `in_` + 26 base32 characters. The caller supplies 16 random bytes, in the transaction that writes the first entry (section 2.2). */
export function newIncarnation(randomBytes16: Uint8Array): Incarnation {
  if (randomBytes16.length !== 16) throw new Error("an incarnation is made from 16 random bytes");
  return `in_${base32(randomBytes16)}`;
}

/** Computed last, over bytes that do not contain it: the `Entry` type has no hash field (section 4.1). */
export function entryHash(entry: Entry): Digest {
  return digest(DOMAINS.entry, entry);
}

/** A view of a sealed entry. It travels beside the entry and is never part of that entry's bytes (section 3, point 5). */
export function factRefOf(entry: Entry): FactRef {
  return { at: entry.at, seq: entry.seq, hash: entryHash(entry) };
}

export function messageDigest(message: Message): Digest {
  return digest(DOMAINS.message, message);
}

/** The cause of a scope that a delivery's handler creates (section 7.2). */
export function deliveryCauseDigest(cause: DeliveryCause): Digest {
  return digest(DOMAINS.delivery, cause);
}

export function definitionDigest(definition: DeclaredDefinition): Digest {
  return digest(DOMAINS.definition, definition);
}

/**
 * The digest that names a detached text (section 6.2): over the text as one
 * JSON string. An intent, an entry and an effect hold this digest, and never
 * the text. Throws for a text with a lone surrogate, which has no canonical
 * bytes.
 */
export function textDigest(text: string): Digest {
  return digest(DOMAINS.text, text);
}

/**
 * The digest of a snapshot of staged refs (sections 2.1 and 16.4): over the
 * list of `{ ref, target }` pairs, which the caller gives in byte order of
 * `ref`.
 */
export function snapshotDigest(pairs: readonly { ref: string; target: string }[]): Digest {
  return digest(DOMAINS.snapshot, pairs);
}

const named = (value: unknown, prefix: string, chars: number, bytes: number): boolean =>
  typeof value === "string" && value.length === prefix.length + chars && value.startsWith(prefix) && unbase32(value.slice(prefix.length))?.length === bytes;

export function isScopeId(value: unknown): value is ScopeId {
  return named(value, "sc_", 52, 32);
}

export function isIncarnation(value: unknown): value is Incarnation {
  return named(value, "in_", 26, 16);
}
