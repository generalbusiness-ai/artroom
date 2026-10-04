import { describe, expect, test } from "vitest";
import { DOMAINS } from "@generalbusiness/artroom-contract";
import type { Digest, Intent, Seed, SignedIntent } from "@generalbusiness/artroom-contract";
import {
  b64url, canonicalBytes, canonicalize, definitionDigest, deliveryCauseDigest, digestBytes, domainBytes, entryHash, factRefOf, intentDigest, isDigest,
  isIncarnation, isScopeId, keyIdOfSecret, messageDigest, newIncarnation, scopeIdOf, seedDigest, sign, signIntent, unb64url, utf8, verifySignedIntent,
} from "../src/index.ts";
import { cause, definition, directory, entry, intent, message, otherSecret, secret, seed } from "./fixtures.ts";

/** Every digest function with its domain and a value of its type. */
const digests: readonly (readonly [string, (value: never) => Digest, object])[] = [
  [DOMAINS.intent, intentDigest, intent],
  [DOMAINS.seed, seedDigest, seed],
  [DOMAINS.entry, entryHash, entry],
  [DOMAINS.message, messageDigest, message],
  [DOMAINS.delivery, deliveryCauseDigest, cause],
  [DOMAINS.definition, definitionDigest, definition],
];
const run = (fn: (value: never) => Digest, value: object) => fn(value as never);

/** One copy of `value` for each top-level field, with that field changed. */
function changed(value: object): [string, object][] {
  return Object.entries(value).map(([k, v]) => {
    const other = typeof v === "number" ? v + 1 : typeof v === "string" ? `${v}x` : typeof v === "boolean" ? !v : v === null ? 0 : Array.isArray(v) ? [...v, 0] : { ...v, x: 1 };
    return [k, { ...value, [k]: other }];
  });
}

describe("byte domains", () => {
  test("each digest is over its own domain tag, a newline and the canonical JSON, so one value under two tags has two digests", () => {
    for (const [tag, fn, value] of digests) {
      const expected = new Uint8Array([...utf8(tag), 0x0a, ...canonicalBytes(value)]);
      expect(domainBytes(tag as never, value), tag).toEqual(expected);
      expect(run(fn, value), tag).toBe(digestBytes(expected));
      expect(isDigest(run(fn, value))).toBe(true);
    }
    // The same value through all six functions: six different digests.
    expect(new Set(digests.map(([, fn]) => run(fn, seed))).size).toBe(6);
  });

  test("a digest commits to every field of its value", () => {
    for (const [tag, fn, value] of digests) {
      const base = run(fn, value);
      for (const [field, other] of changed(value)) expect(run(fn, other), `${tag} ${field}`).not.toBe(base);
    }
  });
});

describe("scope identity", () => {
  test("a scope ID is sc_ and 52 base32 characters, equal for an equal seed, and different when cause, ordinal or creator differs", () => {
    const id = scopeIdOf(seed);
    expect(id).toMatch(/^sc_[a-z2-7]{52}$/);
    expect(isScopeId(id)).toBe(true);
    // An equal seed built in another key order, as a retry would build it.
    const again = Object.fromEntries(Object.entries(seed).reverse()) as unknown as Seed;
    expect(scopeIdOf(again)).toBe(id);
    const others: Seed[] = [
      { ...seed, cause: `sha256:${"d".repeat(64)}` },
      { ...seed, ordinal: 1 },
      { ...seed, creator: null },
      { ...seed, creator: { ...directory, inc: `in_${"b".repeat(26)}` } },
    ];
    expect(new Set([id, ...others.map(scopeIdOf)]).size).toBe(5);
  });

  test("an incarnation is in_ and 26 base32 characters of 16 bytes; a name of another length, alphabet or encoding is not an ID", () => {
    const inc = newIncarnation(new Uint8Array(16).fill(0xff));
    expect(inc).toMatch(/^in_[a-z2-7]{26}$/);
    expect(isIncarnation(inc)).toBe(true);
    expect(newIncarnation(new Uint8Array(16))).not.toBe(inc);
    expect(() => newIncarnation(new Uint8Array(15))).toThrow();
    // Too short, upper case, a character outside the alphabet, set trailing bits, the other prefix.
    for (const bad of [inc.slice(0, -1), inc.toUpperCase(), `in_${"1".repeat(26)}`, `in_${"7".repeat(26)}`, `sc_${inc.slice(3)}`, 7]) expect(isIncarnation(bad), String(bad)).toBe(false);
    for (const bad of [scopeIdOf(seed).slice(0, -1), `sc_${"7".repeat(52)}`, inc]) expect(isScopeId(bad), String(bad)).toBe(false);
  });
});

describe("signed intents", () => {
  const signed = signIntent(intent, secret);

  test("an intent signed by its actor verifies, and the signature is over the intent domain", () => {
    expect(verifySignedIntent(signed)).toBe(true);
    // A signature by the same key over the bare canonical bytes, or under another tag, is not a signed intent.
    for (const bytes of [canonicalBytes(intent), domainBytes(DOMAINS.entry, intent)]) expect(verifySignedIntent({ intent, sig: sign(secret, bytes) })).toBe(false);
  });

  test("a changed intent, a changed signature or another key fails", () => {
    for (const [field, other] of changed(intent)) expect(verifySignedIntent({ intent: other as Intent, sig: signed.sig }), field).toBe(false);
    const raw = unb64url(signed.sig)!;
    for (const at of [0, 31, 32, 63]) {
      const flipped = Uint8Array.from(raw, (b, i) => (i === at ? b ^ 1 : b));
      expect(verifySignedIntent({ intent, sig: b64url(flipped) }), `byte ${at}`).toBe(false);
    }
    // Signed by a key that is not the actor; and the actor replaced by the key that did sign.
    const forged = signIntent(intent, otherSecret);
    expect(verifySignedIntent(forged)).toBe(false);
    expect(verifySignedIntent({ intent: { ...intent, actor: keyIdOfSecret(otherSecret) }, sig: signed.sig })).toBe(false);
  });

  test("malformed input is answered false and never throws", () => {
    const malformed: unknown[] = [
      null, {}, { intent }, { intent, sig: 7 }, { intent, sig: "" }, { intent, sig: "!" }, { intent, sig: `${signed.sig}A` }, { intent, sig: `${signed.sig}=` },
      { intent: { ...intent, actor: "key_short" }, sig: signed.sig },
      { intent: { ...intent, actor: `key_${b64url(new Uint8Array(32).fill(0xff))}` }, sig: signed.sig }, // 32 bytes that encode no point
      { intent: { ...intent, on: 1.5 }, sig: signed.sig }, // no canonical bytes exist
    ];
    for (const value of malformed) expect(verifySignedIntent(value as SignedIntent), JSON.stringify(value)?.slice(0, 60)).toBe(false);
  });
});

describe("entries", () => {
  test("an entry's hash is over bytes that do not contain it, and a fact reference is a view beside the entry", () => {
    const before = canonicalize(entry);
    const hash = entryHash(entry);
    const fact = factRefOf(entry);
    expect(canonicalize(entry)).toBe(before);
    expect(before).not.toContain(hash);
    expect(entry).not.toHaveProperty("hash");
    expect(fact).toEqual({ at: entry.at, seq: 17, hash });
    // The next entry holds this hash as `prev`: a hash that already exists.
    expect(canonicalize({ ...entry, seq: 18, prev: fact.hash })).toContain(hash);
  });
});
