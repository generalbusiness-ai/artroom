import { describe, expect, test } from "vitest";
import { DOMAINS } from "@generalbusiness/artroom-contract";
import type { Digest, Message, Seed, SignedIntent } from "@generalbusiness/artroom-contract";
import {
  b64url, canonicalBytes, canonicalize, definitionDigest, deliveryCauseDigest, digestBytes, domainBytes, entryHash, factRefOf, intentDigest,
  isDutyId, isIncarnation, isKeyId, isMemberId, isOperationId, isPlatformDefinition, isScopeId, isScopeKind, keyIdOfSecret, messageDigest, newIncarnation, scopeIdOf, seedDigest, sign, signIntent, unb64url, utf8, verifySignedIntent,
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

describe("byte domains", () => {
  test("each of the six digests is over its own tag, one newline byte and the canonical JSON of its value", () => {
    for (const [tag, fn, value] of digests) {
      const expected = new Uint8Array([...utf8(tag), 0x0a, ...canonicalBytes(value)]);
      expect(domainBytes(tag as never, value), tag).toEqual(expected);
      expect(run(fn, value), tag).toBe(digestBytes(expected));
    }
    // So one value under the six tags has six digests.
    expect(new Set(digests.map(([, fn]) => run(fn, seed))).size).toBe(6);
  });

  test("one message's bytes and digest are the ones written out here", () => {
    // Neither expected value was produced by this package. The text is canonical JSON written by hand: keys in order, no
    // spaces. Its SHA-256 was computed once with Node's `crypto.createHash("sha256")`, in a one-off command.
    const text = 'artroom-message-1\n{"body":{"n":1},"class":"advisory","type":"index"}';
    const value: Message = { class: "advisory", type: "index", body: { n: 1 } };
    expect(domainBytes(DOMAINS.message, value)).toEqual(new TextEncoder().encode(text));
    expect(messageDigest(value)).toBe("sha256:8e6e8bab371f3c95f753a75291f29a9cad024babc6f69c70b35d476b89aef1f6");
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

  test("an intent signed by its actor verifies; an altered payload, another key, another domain and an altered signature do not", () => {
    expect(verifySignedIntent(signed)).toBe(true);
    const flipped = Uint8Array.from(unb64url(signed.sig)!, (b, i) => (i === 0 ? b ^ 1 : b));
    const others: readonly (readonly [string, SignedIntent])[] = [
      ["an altered payload", { intent: { ...intent, kind: "close-issue" }, sig: signed.sig }],
      ["signed by a key that is not the actor", signIntent(intent, otherSecret)],
      ["signed under another domain", { intent, sig: sign(secret, domainBytes(DOMAINS.entry, intent)) }],
      ["an altered signature", { intent, sig: b64url(flipped) }],
    ];
    for (const [name, other] of others) expect(verifySignedIntent(other), name).toBe(false);
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

describe("identifiers", () => {
  test("each identifier the contract names has one guard, which takes its one form and nothing near it", () => {
    const key = keyIdOfSecret(new Uint8Array(32).fill(1));
    const forms: [(v: unknown) => boolean, unknown[], unknown[]][] = [
      [isKeyId, [key], [key.slice(0, -1), `${key}A`, key.replace("key_", "KEY_"), 7]],
      [isMemberId, ["@a", "@Alice Smith"], ["@", "a", "@\ud800", null]],
      [isOperationId, ["op_1"], ["op_", "1", null]],
      [isDutyId, ["0.0", "17.2"], ["17", "17.02", "1.2.3", "-1.0", 17.2]],
      [isPlatformDefinition, ["platform:directory@1"], ["platform:lane@1", "platform:directory@01", "directory@1"]],
      [isScopeKind, ["lane", "directory"], ["room", "", null]],
    ];
    for (const [guard, good, bad] of forms) expect([good.map(guard), bad.map(guard)], guard.name).toEqual([good.map(() => true), bad.map(() => false)]);
  });
});

