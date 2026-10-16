/** Bounded query replies. Shape checks grant no authority or prefix coverage. */
import { ITEM_QUERY_ARGUMENT_PREFIX, ITEM_QUERY_BOUNDS as B, ITEM_QUERY_REFUSALS, ITEM_QUERY_WIRE_BOUNDS } from "@generalbusiness/dap-contract";
import type { ItemQuery, ItemQueryRead } from "@generalbusiness/dap-contract";
import { canonicalize, parseStrict, utf8 } from "./canonical.ts";
import { isDigest } from "./hash.ts";
import { isHead, isItem, isRecord, isScopeRef } from "./records.ts";
import { itemQueryArgument, itemQueryContinuation, itemQueryDigest, readItemQueryCursor } from "./item-query.ts";
const only = (value: object, names: string) => Object.keys(value).sort().join() === names;
const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);

/** For already materialized RPC data. The trusted producer caps allocation;
 * this check bounds its canonical representation before accepting it. */
export function isItemQueryRead(value: unknown): value is ItemQueryRead {
  try {
    if (!isRecord(value)) return false;
    if (value["ok"] === false) return only(value, "ok,reason") && typeof value["reason"] === "string" && ITEM_QUERY_REFUSALS.some(reason => reason === value["reason"])
      && utf8(canonicalize(value)).length <= ITEM_QUERY_WIRE_BOUNDS.errorBytes;
    const body = value["value"], complete = value["complete"];
    if (value["ok"] !== true || typeof complete !== "boolean" || !only(value, complete ? "at,complete,ok,value" : "at,complete,next,ok,value") || !isHead(value["at"])
      || !isRecord(body) || !only(body, "argument,items,query,scope,v") || body["v"] !== 1 || !isScopeRef(body["scope"]) || !isDigest(body["query"])
      || typeof body["argument"] !== "string" || body["argument"].length !== 86 || !body["argument"].startsWith(ITEM_QUERY_ARGUMENT_PREFIX)
      || !isDigest(body["argument"].slice(ITEM_QUERY_ARGUMENT_PREFIX.length)) || !Array.isArray(body["items"]) || body["items"].length > B.rows
      || !body["items"].every((item: unknown, index: number, items: unknown[]) => isItem(item) && (index === 0 || (items[index - 1] as { id: number }).id < item.id))) return false;
    if (!complete) {
      const cursor = readItemQueryCursor(value["next"]), last = body["items"].at(-1) as { id: number } | undefined;
      if (!cursor || !last || cursor.last !== last.id || !same(cursor.scope, body["scope"]) || !same(cursor.head, value["at"]) || cursor.query !== body["query"]) return false;
    }
    return utf8(canonicalize(value)).length <= B.payloadBytes;
  } catch { return false; }
}

/** Match the exact selection, current page argument, suffix, and continuation. */
export function itemQueryReadFor(value: unknown, query: ItemQuery): value is ItemQueryRead {
  if (!isItemQueryRead(value)) return false;
  if (!value.ok) return true;
  if (!same(value.value.scope, query.scope) || value.value.query !== itemQueryDigest(query) || value.value.argument !== itemQueryArgument(query) || value.value.items.length > query.limit) return false;
  const continuation = itemQueryContinuation(query, value.value.scope, value.at);
  if (!continuation.ok || value.value.items.some(item => item.type !== query.type || !query.states.includes(item.state) || continuation.after !== null && item.id <= continuation.after || query.ids !== null && !query.ids.includes(item.id))) return false;
  const next = value.complete ? null : readItemQueryCursor(value.next);
  return value.complete || next !== null && next.limit === query.limit;
}

/** Admit actual UTF-8 bytes before decoding/strict parsing. Canonical form
 * and duplicate-member rejection apply to the whole response envelope. */
export function readItemQueryReply(bytes: Uint8Array, query?: ItemQuery): ItemQueryRead | null {
  if (bytes.length > B.payloadBytes) return null;
  try {
    const raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    // A bounded lexical scan prevents deeply nested JSON from reaching the
    // parser or recursive validators. Strings and escaped quotes are opaque.
    let depth = 0, quoted = false;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (quoted) { if (c === "\\") i++; else if (c === '"') quoted = false; }
      else if (c === '"') quoted = true;
      else if (c === "[" || c === "{") { if (++depth > 64) return null; }
      else if (c === "]" || c === "}") { if (--depth < 0) return null; }
    }
    if (quoted || depth !== 0) return null;
    const value: unknown = parseStrict(raw);
    if (canonicalize(value) !== raw || !isItemQueryRead(value) || query && !itemQueryReadFor(value, query)) return null;
    return value;
  } catch { return null; }
}
