import { createHash } from "node:crypto";
import { expect, test, vi } from "vitest";
import { ITEM_QUERY_ARGUMENT_PREFIX, ITEM_QUERY_BOUNDS as B, ITEM_QUERY_CURSOR_PREFIX, ITEM_QUERY_ORDER } from "@generalbusiness/dap-contract";
import type { Digest, Head, ItemQuery, ItemQueryCursor, ScopeRef } from "@generalbusiness/dap-contract";
import { canonicalize, utf8 } from "../src/canonical.ts";
import * as canonical from "../src/canonical.ts";
import * as hashing from "../src/hash.ts";
import { b64url } from "../src/encode.ts";
import * as encoding from "../src/encode.ts";
import { encodeItemQuery, encodeItemQueryCursor, itemQueryArgument, itemQueryContinuation, itemQueryDigest, readItemQuery, readItemQueryCursor } from "../src/item-query.ts";

const digest = (letter: string): Digest => `sha256:${letter.repeat(64)}`;
const scope: ScopeRef = { scope: `sc_${"a".repeat(52)}`, inc: `in_${"a".repeat(26)}`, kind: "lane" };
const head: Head = { seq: 12, hash: digest("a") };
const query = (over: Partial<ItemQuery> = {}): ItemQuery => ({ v: 1, scope, type: "task", states: ["open"], ids: null, limit: 100, cursor: null, ...over });
const cursor = (over: Partial<ItemQueryCursor> = {}): ItemQueryCursor => ({ v: 1, scope, head, query: itemQueryDigest(query())!, order: ITEM_QUERY_ORDER, bounds: B, limit: 100, last: 3, ...over });
const encoded = (value: unknown): string => ITEM_QUERY_CURSOR_PREFIX + b64url(utf8(canonicalize(value)));

test("bounded query bytes have one exact canonical shape and immutable decoded lists", () => {
  const value = query({ states: ["open", "ready"], ids: [0, 7, Number.MAX_SAFE_INTEGER] }), raw = encodeItemQuery(value)!;
  expect(raw).toBe('{"cursor":null,"ids":[0,7,9007199254740991],"limit":100,"scope":' + canonicalize(scope) + ',"states":["open","ready"],"type":"task","v":1}');
  const read = readItemQuery(raw)!;
  expect(read).toEqual(value); expect(Object.isFrozen(read)).toBe(true); expect(Object.isFrozen(read.states)).toBe(true); expect(Object.isFrozen(read.ids)).toBe(true);
  for (const invalid of [null, {}, " " + raw, raw + "\n", raw.replace('"v":1', '"v":1,"v":1'), canonicalize({ ...value, extra: 1 })]) expect(readItemQuery(invalid)).toBeNull();
  expect(encodeItemQuery({ ...value, extra: 1 } as ItemQuery)).toBeNull();
});

test("state UTF8 order and numeric ID order are unique, finite and preserve empty versus all selection", () => {
  const all = query(), none = query({ ids: [] }), emptyStates = query({ states: [] });
  expect(readItemQuery(encodeItemQuery(none))).toMatchObject({ ids: [] }); expect(readItemQuery(encodeItemQuery(all))).toMatchObject({ ids: null });
  expect(new Set([itemQueryDigest(all), itemQueryDigest(none), itemQueryDigest(emptyStates)]).size).toBe(3);
  expect(encodeItemQuery(query({ states: ["\ue000", "😀"] }))).not.toBeNull();
  const invalid = [query({ states: ["😀", "\ue000"] }), query({ states: ["open", "open"] }), query({ ids: [2, 1] }), query({ ids: [1, 1] }), query({ ids: [-1] }), query({ ids: [-0] }), query({ ids: [Number.MAX_SAFE_INTEGER + 1] }), query({ states: ["\ud800"] })];
  for (const value of invalid) { expect(encodeItemQuery(value)).toBeNull(); expect(itemQueryArgument(value)).toBeNull(); }
});

test("real count, spelling and row bounds admit exact edges and reject the next value", () => {
  const states = Array.from({ length: B.states }, (_, n) => `s${n.toString().padStart(2, "0")}`), ids = Array.from({ length: B.ids }, (_, n) => n);
  const edge = query({ type: "é".repeat(32), states, ids, limit: B.rows });
  expect(readItemQuery(encodeItemQuery(edge))).toEqual(edge);
  expect(encodeItemQuery(query({ states: ["é".repeat(32)] }))).not.toBeNull();
  for (const value of [query({ type: "é".repeat(33) }), query({ states: ["é".repeat(33)] }), query({ states: [...states, "s99"] }), query({ ids: [...ids, B.ids] }), query({ limit: B.rows + 1 }), query({ limit: 0 }), query({ cursor: "x".repeat(B.cursorBytes + 1) })]) expect(encodeItemQuery(value)).toBeNull();
});

test("raw query bytes and lexical nesting are admitted before JSON parse, and escaped payload size before hashing", () => {
  const parse = vi.spyOn(canonical, "parseStrict"), hash = vi.spyOn(hashing, "digestBytes");
  try {
    expect(readItemQuery("x".repeat(B.queryBytes + 1))).toBeNull();
    expect(readItemQuery("é".repeat(B.queryBytes))).toBeNull();
    expect(readItemQuery('{"cursor":null,"ids":null,"limit":1,"states":[[[[0]]]],"type":"task","v":1}')).toBeNull();
    expect(parse).not.toHaveBeenCalled();
    const escaped = query({ cursor: "\u0000".repeat(B.cursorBytes) });
    expect(utf8(canonicalize(escaped)).length).toBeGreaterThan(B.queryBytes);
    expect(encodeItemQuery(escaped)).toBeNull(); expect(itemQueryArgument(escaped)).toBeNull(); expect(itemQueryDigest(escaped)).toBeNull();
    expect(hash).not.toHaveBeenCalled();
  } finally { parse.mockRestore(); hash.mockRestore(); }
  // Delimiters and escaped quotes within a string are not JSON nesting.
  expect(readItemQuery(encodeItemQuery(query({ type: '{["\\' })))).not.toBeNull();
});

test("fixed width argument binds exact page bytes and selection identity binds every fixed bound", () => {
  const value = query(), raw = canonicalize({ query: value, order: ITEM_QUERY_ORDER, bounds: B });
  const expected = "query-items-v1:sha256:" + createHash("sha256").update("artroom-item-query-argument-1\n" + raw).digest("hex");
  expect(itemQueryArgument(value)).toBe(expected); expect(expected).toHaveLength(86); expect(expected.startsWith(ITEM_QUERY_ARGUMENT_PREFIX)).toBe(true);
  const variants = [query({ type: "other" }), query({ states: [] }), query({ states: ["done"] }), query({ ids: [] }), query({ ids: [0] }), query({ limit: 1 }), query({ cursor: "" }), query({ cursor: "not-yet-a-valid-cursor" })];
  expect(new Set([expected, ...variants.map(itemQueryArgument)]).size).toBe(variants.length + 1);
  expect(itemQueryDigest(query({ cursor: "one" }))).toBe(itemQueryDigest(query({ cursor: "two" })));
  const selection = { v: 1, scope, type: value.type, states: value.states, ids: value.ids, limit: value.limit, order: "id-ascending", bounds: B };
  expect(itemQueryDigest(value)).toBe("sha256:" + createHash("sha256").update("artroom-item-query-selection-1\n" + canonicalize(selection)).digest("hex"));
});

test("cursor canonical base64url binds full identity/head/order/bounds/query and cannot grant a prefix", () => {
  const value = cursor(), raw = encodeItemQueryCursor(value)!;
  expect(raw.length).toBeLessThanOrEqual(B.cursorBytes); expect(readItemQueryCursor(raw)).toEqual(value);
  const continued = query({ cursor: raw });
  expect(itemQueryContinuation(continued, scope, head)).toEqual({ ok: true, after: 3 });
  expect(itemQueryContinuation(query(), scope, head)).toEqual({ ok: true, after: null });
  expect(itemQueryArgument(continued)).not.toBe(itemQueryArgument(query()));
  expect(itemQueryDigest(continued)).toBe(itemQueryDigest(query()));
  // A caller can forge a larger last ID. The codec makes no integrity,
  // authority or previously-read-prefix claim about this continuation.
  const forged = encodeItemQueryCursor(cursor({ last: Number.MAX_SAFE_INTEGER }))!;
  expect(itemQueryContinuation(query({ cursor: forged }), scope, head)).toEqual({ ok: true, after: Number.MAX_SAFE_INTEGER });
  expect(Object.isFrozen(readItemQueryCursor(raw)!.scope)).toBe(true);
});

test("cursor spelling, schema, UTF8, bound and nesting failures are distinct from valid continuation", () => {
  const decode = vi.spyOn(encoding, "unb64url");
  try {
    const multibyte = ITEM_QUERY_CURSOR_PREFIX + "é".repeat(1100);
    expect(multibyte.length).toBeLessThan(B.cursorBytes); expect(utf8(multibyte).length).toBeGreaterThan(B.cursorBytes);
    expect(readItemQueryCursor(multibyte)).toBeNull(); expect(readItemQueryCursor("x".repeat(B.cursorBytes + 1))).toBeNull();
    expect(decode).not.toHaveBeenCalled();
  } finally { decode.mockRestore(); }
  const raw = encodeItemQueryCursor(cursor())!;
  const invalid = [null, {}, raw + "=", "iq2." + raw.slice(4), ITEM_QUERY_CURSOR_PREFIX, "x".repeat(B.cursorBytes + 1), ITEM_QUERY_CURSOR_PREFIX + b64url(new Uint8Array([255])), ITEM_QUERY_CURSOR_PREFIX + b64url(utf8(" " + canonicalize(cursor()))), encoded({ ...cursor(), extra: 1 }), encoded({ ...cursor(), v: 2 }), encoded({ ...cursor(), order: "descending" }), encoded({ ...cursor(), bounds: { ...B, payloadBytes: B.payloadBytes + 1 } }), encoded({ ...cursor(), last: -1 }), encoded({ ...cursor(), limit: 101 })];
  for (const value of invalid) expect(readItemQueryCursor(value)).toBeNull();
  expect(encodeItemQueryCursor({ ...cursor(), bounds: { ...B, payloadBytes: B.payloadBytes + 1 } })).toBeNull();
  expect(readItemQueryCursor(ITEM_QUERY_CURSOR_PREFIX + b64url(utf8(canonicalize(cursor()).replace('"v":1', '"v":1,"v":1'))))).toBeNull();
  expect(itemQueryContinuation(query({ cursor: "" }), scope, head)).toEqual({ ok: false, reason: "invalid-cursor" });
});

test("authorized continuation checks report full head/incarnation drift and exact query mismatch", () => {
  const current = query({ cursor: encodeItemQueryCursor(cursor())! });
  for (const of of [{ ...scope, kind: "rules" as const }, { ...scope, inc: `in_${"b".repeat(25)}a` as const }]) {
    expect(itemQueryContinuation(current, of, head)).toEqual({ ok: false, reason: "wrong-scope" });
    expect(itemQueryContinuation({ ...current, scope: of }, of, head)).toEqual({ ok: false, reason: "stale-cursor" });
    expect(itemQueryArgument(query({ scope: of }))).not.toBe(itemQueryArgument(query()));
  }
  for (const at of [{ ...head, seq: 13 }, { ...head, hash: digest("b") }]) expect(itemQueryContinuation(current, scope, at)).toEqual({ ok: false, reason: "stale-cursor" });
  for (const changed of [query({ ...current, type: "other" }), query({ ...current, ids: [] }), query({ ...current, limit: 1 }), query({ ...current, states: ["done"] })]) expect(itemQueryContinuation(changed, scope, head)).toEqual({ ok: false, reason: "query-mismatch" });
});
