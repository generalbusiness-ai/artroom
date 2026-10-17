/** Pure bounded codecs. A caller authenticates before using cursor/query
 * semantic results or looking up a type, state, scope or current head. */
import { ITEM_QUERY_ARGUMENT_PREFIX, ITEM_QUERY_BOUNDS as B, ITEM_QUERY_CURSOR_PREFIX, ITEM_QUERY_DOMAINS, ITEM_QUERY_ORDER, ITEM_QUERY_WIRE_BOUNDS } from "@generalbusiness/dap-contract";
import type { Digest, Head, ItemQuery, ItemQueryCursor, ScopeRef } from "@generalbusiness/dap-contract";
import { byteOrder, canonicalBytes, canonicalize, parseStrict, utf8, wellFormed } from "./canonical.ts";
import { b64url, unb64url } from "./encode.ts";
import { digestBytes, isDigest } from "./hash.ts";
import { isHead, isRecord, isScopeRef } from "./records.ts";
import { taggedBytes } from "./session.ts";

const whole = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const text = (value: unknown, cap: number, empty = false): value is string => typeof value === "string" && (empty || value.length > 0) && value.length <= cap && wellFormed(value) && utf8(value).length <= cap;
const keys = (value: object, names: string) => Object.keys(value).sort().join() === names;

/** Lexical nesting admission before JSON parsing; escapes and delimiters
 * inside strings are not structure. Strict parsing still checks all syntax. */
function withinDepth(raw: string): boolean {
  let depth = 0, quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (quoted) { if (char === "\\") i++; else if (char === '"') quoted = false; continue; }
    if (char === '"') quoted = true;
    else if (char === "[" || char === "{") { if (++depth > B.depth) return false; }
    else if (char === "]" || char === "}") { if (--depth < 0) return false; }
  }
  return depth === 0 && !quoted;
}
function parse(raw: unknown, cap: number): unknown {
  if (!text(raw, cap) || !withinDepth(raw)) return null;
  try { const value: unknown = parseStrict(raw); return canonicalize(value) === raw ? value : null; } catch { return null; }
}
function query(value: unknown): ItemQuery | null {
  if (!isRecord(value) || value["v"] !== 1 || !isScopeRef(value["scope"]) || !text(value["type"], B.nameBytes)
    || !Array.isArray(value["states"]) || value["states"].length > B.states
    || !value["states"].every((state: unknown, i: number, states: unknown[]) => text(state, B.nameBytes) && (i === 0 || byteOrder(states[i - 1] as string, state) < 0))
    || !(value["ids"] === null || (Array.isArray(value["ids"]) && value["ids"].length <= B.ids && value["ids"].every((id: unknown, i: number, ids: unknown[]) => whole(id) && (i === 0 || (ids[i - 1] as number) < id))))
    || !whole(value["limit"]) || value["limit"] < 1 || value["limit"] > B.rows
    || !(value["cursor"] === null || text(value["cursor"], B.cursorBytes, true)) || !keys(value, "cursor,ids,limit,scope,states,type,v")) return null;
  return Object.freeze({ v: 1, scope: Object.freeze({ ...value["scope"] }), type: value["type"], states: Object.freeze([...value["states"]]) as readonly string[], ids: value["ids"] === null ? null : Object.freeze([...value["ids"]]) as readonly number[], limit: value["limit"], cursor: value["cursor"] });
}

/** Remote input is raw bounded canonical JSON, never an already parsed tree. */
export function readItemQuery(raw: unknown): ItemQuery | null { try { return query(parse(raw, B.queryBytes)); } catch { return null; } }
function admitted(value: ItemQuery): { value: ItemQuery; raw: string } | null {
  const checked = query(value); if (!checked) return null;
  const raw = canonicalize(checked);
  return utf8(raw).length <= B.queryBytes ? { value: checked, raw } : null;
}
/** Typed local producer. Preflight known fields/counts before serialization. */
export function encodeItemQuery(value: ItemQuery): string | null {
  try { return admitted(value)?.raw ?? null; } catch { return null; }
}
/** A local producer encodes the already admitted canonical query, not an arbitrary tree. */
export function encodeItemQueryParameter(value: ItemQuery): string | null {
  const raw = encodeItemQuery(value);
  return raw === null ? null : b64url(utf8(raw));
}
/** Remote consumers call this only inside their own admitted operation. */
export function readItemQueryParameter(encoded: unknown): ItemQuery | null {
  if (typeof encoded !== "string" || encoded.length === 0 || encoded.length > ITEM_QUERY_WIRE_BOUNDS.encodedChars || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  const bytes = unb64url(encoded);
  if (!bytes || bytes.length > B.queryBytes || b64url(bytes) !== encoded) return null;
  try { return readItemQuery(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)); }
  catch { return null; }
}
function selection(value: ItemQuery) { return { v: value.v, scope: value.scope, type: value.type, states: value.states, ids: value.ids, limit: value.limit, order: ITEM_QUERY_ORDER, bounds: B }; }
/** Selection identity excludes the current cursor, avoiding self-reference. */
export function itemQueryDigest(value: ItemQuery): Digest | null {
  try { const checked = admitted(value)?.value; return checked ? digestBytes(taggedBytes(ITEM_QUERY_DOMAINS.selection, canonicalBytes(selection(checked)))) : null; } catch { return null; }
}
/** Fixed-width tagged argument binds every query field, including exact
 * cursor bytes or explicit absence, order, version and fixed resource bounds. */
export function itemQueryArgument(value: ItemQuery): string | null {
  try { const checked = admitted(value)?.value; return checked ? ITEM_QUERY_ARGUMENT_PREFIX + digestBytes(taggedBytes(ITEM_QUERY_DOMAINS.argument, canonicalBytes({ query: checked, order: ITEM_QUERY_ORDER, bounds: B }))) : null; } catch { return null; }
}

function cursor(value: unknown): ItemQueryCursor | null {
  if (!isRecord(value) || value["v"] !== 1 || !isScopeRef(value["scope"]) || !isHead(value["head"]) || !isDigest(value["query"])
    || value["order"] !== ITEM_QUERY_ORDER
    || !whole(value["limit"]) || value["limit"] < 1 || value["limit"] > B.rows || !whole(value["last"])
    || !keys(value, "bounds,head,last,limit,order,query,scope,v")) return null;
  const bounds = value["bounds"];
  if (!isRecord(bounds) || !keys(bounds, Object.keys(B).sort().join()) || !Object.keys(B).every(key => bounds[key] === B[key as keyof typeof B])) return null;
  return Object.freeze({ v: 1, scope: Object.freeze({ ...value["scope"] }), head: Object.freeze({ ...value["head"] }), query: value["query"], order: ITEM_QUERY_ORDER, bounds: B, limit: value["limit"], last: value["last"] });
}
export function encodeItemQueryCursor(value: ItemQueryCursor): string | null {
  try { const checked = cursor(value); if (!checked) return null; const raw = ITEM_QUERY_CURSOR_PREFIX + b64url(canonicalBytes(checked)); return raw.length <= B.cursorBytes ? raw : null; } catch { return null; }
}
export function readItemQueryCursor(raw: unknown): ItemQueryCursor | null {
  if (typeof raw !== "string" || raw.length > B.cursorBytes || !raw.startsWith(ITEM_QUERY_CURSOR_PREFIX)) return null;
  try {
    const body = raw.slice(ITEM_QUERY_CURSOR_PREFIX.length);
    // Base64url is ASCII, so this admission also makes characters equal
    // actual UTF-8 bytes before the decoder can allocate its output.
    if (!/^[A-Za-z0-9_-]+$/.test(body)) return null;
    const bytes = unb64url(body);
    if (!bytes) return null;
    const json = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes), checked = cursor(parse(json, B.cursorBytes));
    return checked && encodeItemQueryCursor(checked) === raw ? checked : null;
  } catch { return null; }
}

export type ItemQueryContinuation = { ok: true; after: number | null } | { ok: false; reason: "invalid-cursor" | "query-mismatch" | "stale-cursor" | "wrong-scope" };
/** Use only after authorization. This proves no prefix or cursor integrity. */
export function itemQueryContinuation(value: ItemQuery, scope: ScopeRef, head: Head): ItemQueryContinuation {
  try {
    const checked = admitted(value)?.value;
    if (!checked || !isScopeRef(scope) || !isHead(head)) return { ok: false, reason: "invalid-cursor" };
    if (canonicalize(checked.scope) !== canonicalize(scope)) return { ok: false, reason: "wrong-scope" };
    if (checked.cursor === null) return { ok: true, after: null };
    const matched = readItemQueryCursor(checked.cursor);
    if (!matched) return { ok: false, reason: "invalid-cursor" };
    if (canonicalize(matched.scope) !== canonicalize(scope) || canonicalize(matched.head) !== canonicalize(head)) return { ok: false, reason: "stale-cursor" };
    return matched.query === itemQueryDigest(checked) && matched.limit === checked.limit ? { ok: true, after: matched.last } : { ok: false, reason: "query-mismatch" };
  } catch { return { ok: false, reason: "invalid-cursor" }; }
}
