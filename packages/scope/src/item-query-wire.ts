/** Finite routing syntax only. Decode/hash belongs to the Scope-owned operation. */
import { ITEM_QUERY_WIRE_BOUNDS } from "@generalbusiness/dap-contract";
import { isScopeId, utf8 } from "@generalbusiness/artroom-bytes";
export { readItemQueryParameter as decodeItemQueryWire } from "@generalbusiness/artroom-bytes";

export const REQUEST_URL_BYTES = ITEM_QUERY_WIRE_BOUNDS.commonUrlBytes;
export const ITEM_QUERY_URL_BYTES = ITEM_QUERY_WIRE_BOUNDS.urlBytes;
export const ITEM_QUERY_ENCODED_CHARS = ITEM_QUERY_WIRE_BOUNDS.encodedChars;
const queryTarget = /^https?:\/\/[^/?#]+\/v1\/scopes\/[^/?#]+\/query-items(?:[?#]|$)/;
const queryUrl = /^https?:\/\/[^/?#]+\/v1\/scopes\/([^/?#]+)\/query-items\?q=([A-Za-z0-9_-]+)$/;

/** Call before every outer URL parser. Character admission precedes UTF-8 allocation. */
export function admittedRequestUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > REQUEST_URL_BYTES) return false;
  const limit = queryTarget.test(raw) ? ITEM_QUERY_URL_BYTES : REQUEST_URL_BYTES;
  return raw.length <= limit && utf8(raw).length <= limit;
}

export type ItemQueryWire = { ok: true; encoded: string } | { ok: false; reason: "invalid-query" | "too-large" };
/** No query decode, hashing, namespace lookup or authority lookup. No URL aliases. */
export function itemQueryWire(request: Pick<Request, "url" | "method" | "body">, scope: string): ItemQueryWire {
  if (!admittedRequestUrl(request.url) || request.url.length > ITEM_QUERY_URL_BYTES || utf8(request.url).length > ITEM_QUERY_URL_BYTES) return { ok: false, reason: "too-large" };
  if (request.method !== "GET" || request.body !== null || !isScopeId(scope)) return { ok: false, reason: "invalid-query" };
  const found = queryUrl.exec(request.url);
  if (!found || found[0] !== request.url || found[1] !== scope || !isScopeId(found[1])) return { ok: false, reason: "invalid-query" };
  const encoded = found[2]!;
  return encoded.length <= ITEM_QUERY_ENCODED_CHARS ? { ok: true, encoded } : { ok: false, reason: "too-large" };
}

