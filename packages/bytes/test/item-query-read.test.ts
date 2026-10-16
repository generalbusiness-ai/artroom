import { expect, test, vi } from "vitest";
import { ITEM_QUERY_BOUNDS as B, ITEM_QUERY_ORDER } from "@generalbusiness/dap-contract";
import type { Item, ItemQuery, ItemQueryRead, ScopeRef } from "@generalbusiness/dap-contract";
import { canonicalize, utf8 } from "../src/canonical.ts";
import * as canonical from "../src/canonical.ts";
import { itemQueryArgument, itemQueryDigest, encodeItemQueryCursor } from "../src/item-query.ts";
import { itemQueryReadFor, readItemQueryReply } from "../src/item-query-read.ts";
const scope: ScopeRef = { scope: `sc_${"a".repeat(52)}`, inc: `in_${"a".repeat(26)}`, kind: "lane" as const };
const head = { seq: 12, hash: `sha256:${"a".repeat(64)}` as const };
const query: ItemQuery = { v: 1, scope, type: "task", states: ["open"], ids: null, limit: 2, cursor: null };
const item = (id: number): Item => ({ id, type: "task", state: "open", revision: 1, opened: null, parties: {}, refs: {}, values: {}, attributed: [] });
const page = (): Extract<ItemQueryRead, { ok: true }> => ({ ok: true, at: head, value: { v: 1, scope, query: itemQueryDigest(query)!, argument: itemQueryArgument(query)!, items: [item(2)] }, complete: false, next: encodeItemQueryCursor({ v: 1, scope, head, query: itemQueryDigest(query)!, order: ITEM_QUERY_ORDER, bounds: B, limit: query.limit, last: 2 })! });

test("query reply binds the exact page and its ordered suffix without implying prefix coverage", () => {
  const good = page();
  expect(readItemQueryReply(utf8(canonicalize(good)), query)).toEqual(good);
  expect(itemQueryReadFor({ ...good, complete: true, next: undefined }, query)).toBe(false);
  const { next: _, ...complete } = { ...good, complete: true };
  expect(itemQueryReadFor(complete, query)).toBe(true);
  for (const bad of [
    { ...good, value: { ...good.value, argument: itemQueryArgument({ ...query, ids: [] }) } },
    { ...good, value: { ...good.value, scope: { ...scope, kind: "directory" } } },
    { ...good, value: { ...good.value, items: [] } },
    { ...good, value: { ...good.value, items: [item(2), item(2)] } },
    { ...good, value: { ...good.value, items: [{ ...item(2), state: "closed" }] } },
    { ...good, at: { ...head, seq: head.seq + 1 } },
    { ...good, next: good.next + "=" },
  ]) expect(itemQueryReadFor(bad, query)).toBe(false);
  const suffix = { ...query, cursor: good.next! };
  expect(itemQueryReadFor({ ...good, value: { ...good.value, argument: itemQueryArgument(suffix) } }, suffix)).toBe(false); // repeats last ID
});

test("query reply caps actual bytes and lexical nesting before parsing and rejects noncanonical envelopes", () => {
  const parse = vi.spyOn(canonical, "parseStrict");
  try {
    expect(readItemQueryReply(new Uint8Array(B.payloadBytes + 1))).toBeNull();
    expect(readItemQueryReply(utf8("[".repeat(65) + "0" + "]".repeat(65)))).toBeNull();
    expect(parse).not.toHaveBeenCalled();
    const raw = canonicalize(page());
    for (const bad of [raw + "\n", raw.replace('"ok":true', '"ok":true,"ok":true'), '{"ok":false,"reason":"private diagnostic"}', '{"ok":false,"reason":"forbidden","at":{}}']) expect(readItemQueryReply(utf8(bad), query)).toBeNull();
    expect(readItemQueryReply(utf8('{"ok":false,"reason":"row-too-large"}'), query)).toEqual({ ok: false, reason: "row-too-large" });
  } finally { parse.mockRestore(); }
});
