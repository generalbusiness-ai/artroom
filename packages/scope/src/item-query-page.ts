/** Private synchronous execution. The caller authorizes the exact query,
 * owns its deadline and revalidates its supported frame before entering.
 * It repeats fresh final authentication before releasing these bytes. */
import { ITEM_QUERY_BOUNDS as B, ITEM_QUERY_ORDER } from "@generalbusiness/dap-contract";
import type { Digest, Item, ItemQuery, Read, ScopeRef } from "@generalbusiness/dap-contract";
import { canonicalize, encodeItemQuery, encodeItemQueryCursor, isItem, itemQueryArgument, itemQueryContinuation, itemQueryDigest, parseStrict, readItemQuery, utf8 } from "@generalbusiness/artroom-bytes";
import { itemCandidates } from "./item-candidates.ts";
import type { PreparedRead } from "./read-preparation.ts";
import type { Sql } from "./sqlite.ts";

interface ItemQueryValue { v: 1; scope: ScopeRef; query: Digest; argument: string; items: readonly Item[] }
type Envelope = Extract<Read<ItemQueryValue>, { ok: true }>;
type Failure = "invalid-query" | "wrong-scope" | "invalid-cursor" | "stale-cursor" | "query-mismatch" | "unknown-type" | "unknown-state" | "query-not-ready" | "too-large" | "invalid-metadata" | "invalid-item" | "row-too-large" | "unavailable";
export type ItemQueryPage = { ok: true; serialized: string } | { ok: false; reason: Failure };
const no = (reason: Failure): ItemQueryPage => ({ ok: false, reason });

/** No asynchronous work, Store facade, fallback or standing authority.
 * The full response envelope is capped, not just the item bodies. This
 * function stays off all public dispatch until its caller owns authority. */
export function itemQueryPage(sql: Pick<Sql, "exec">, frame: Pick<PreparedRead, "scope" | "pinned">, query: ItemQuery, active: () => boolean): ItemQueryPage {
  try {
    if (!active()) return no("unavailable");
    const checked = readItemQuery(encodeItemQuery(query));
    if (!checked) return no("invalid-query");
    const { scope, pinned } = frame;
    const continuation = itemQueryContinuation(checked, scope.at, scope.head);
    if (!continuation.ok) return continuation;
    if (scope.status !== "active" || !pinned.definition) return no("query-not-ready");
    const types = pinned.definition.declared.items;
    if (!Object.hasOwn(types, checked.type)) return no("unknown-type");
    const type = types[checked.type]!;
    if (checked.states.some(state => !Object.hasOwn(type.states, state))) return no("unknown-state");
    const digest = itemQueryDigest(checked), argument = itemQueryArgument(checked);
    if (!digest || !argument || !active()) return no("unavailable");
    const selected = itemCandidates(sql, { type: checked.type, states: checked.states, after: continuation.after, ...(checked.ids === null ? {} : { ids: checked.ids }) }, { rows: checked.limit, candidates: B.candidates, metadataBytes: B.metadataBytes });
    if (!selected.ok) return selected;
    if (!active()) return no("unavailable");
    const envelope = (items: readonly Item[], complete: boolean, last: number | null): Envelope | null => {
      const next = complete ? undefined : last === null ? null : encodeItemQueryCursor({ v: 1, scope: scope.at, head: scope.head, query: digest, order: ITEM_QUERY_ORDER, bounds: B, limit: checked.limit, last });
      if (next === null) return null;
      return { ok: true, at: scope.head, value: { v: 1, scope: scope.at, query: digest, argument, items }, complete, ...(next === undefined ? {} : { next }) };
    };
    if (selected.rows.length === 0) {
      const empty = envelope([], true, null);
      const serialized = empty && canonicalize(empty);
      return serialized && utf8(serialized).length <= B.payloadBytes && active() ? { ok: true, serialized } : no("unavailable");
    }
    let count = 0, expectedBytes = 0, sum = 0;
    const maximum = Math.min(checked.limit, selected.rows.length);
    // Check every finite prefix. A final complete page has no cursor and
    // can fit even when the preceding incomplete prefix did not fit.
    for (let n = 1; n <= maximum; n++) {
      const row = selected.rows[n - 1]!;
      const added = row.bytes + (n > 1 ? 1 : 0);
      if (!Number.isSafeInteger(added) || added > B.payloadBytes - sum) break;
      sum += added;
      const header = envelope([], selected.exhausted && n === selected.rows.length, row.id);
      if (!header) return no("unavailable");
      const bytes = utf8(canonicalize(header)).length + sum;
      if (bytes <= B.payloadBytes) { count = n; expectedBytes = bytes; }
    }
    if (count === 0) return no("row-too-large");
    const admitted = selected.rows.slice(0, count);
    const items: Item[] = [];
    for (const row of admitted) {
      if (!active()) return no("unavailable");
      const rows = sql.exec("SELECT record FROM item WHERE id=? AND octet_length(record)=?", row.id, row.bytes).toArray();
      const raw = rows[0]?.["record"];
      if (rows.length !== 1 || typeof raw !== "string" || utf8(raw).length !== row.bytes) return no("invalid-item");
      const item: unknown = parseStrict(raw);
      if (!isItem(item) || item.id !== row.id || item.type !== checked.type || !checked.states.includes(item.state) || canonicalize(item) !== raw) return no("invalid-item");
      items.push(item);
    }
    const complete = selected.exhausted && count === selected.rows.length;
    const result = envelope(items, complete, admitted.at(-1)!.id);
    if (!result || !active()) return no("unavailable");
    const serialized = canonicalize(result), bytes = utf8(serialized).length;
    return bytes === expectedBytes && bytes <= B.payloadBytes && active() ? { ok: true, serialized } : no("too-large");
  } catch { return no("unavailable"); }
}
