/** Only the read methods used by the supported native reference callbacks. */
import { canonicalize, isItem, parseStrict, utf8, wellFormed } from "@generalbusiness/artroom-bytes";
import { byteOrder, type Page, type ScopeState, type StateView } from "@generalbusiness/dap-derive";
import { incarnationEvidence } from "./incarnation-evidence.ts";
import { itemCandidates, ITEM_CANDIDATE_BOUNDS } from "./item-candidates.ts";
import { PreparationBudget } from "./preparation-budget.ts";
import type { Sql } from "./sqlite.ts";

const whole = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const name = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= 64 && wellFormed(s) && utf8(s).length <= 64;

/** Caller obtains the frozen snapshot through preparationScope and keeps
 * one shared budget through preparation and post-await revalidation. */
export function preparationView(sql: Pick<Sql, "exec">, snapshot: ScopeState, budget: PreparationBudget): StateView {
  const page = (type: string, states: readonly string[], after: number | null, limit: number): Page => {
    if (!name(type) || !Array.isArray(states) || states.length > ITEM_CANDIDATE_BOUNDS.states || states.some(s => !name(s))
      || !(after === null || whole(after)) || !whole(limit) || limit < 1 || limit > ITEM_CANDIDATE_BOUNDS.rows) return budget.stop();
    const unique = [...new Set(states)].sort(byteOrder), maximum = unique.length * (limit + 1), metadata = 2 + 64 * maximum;
    budget.spend({ calls: unique.length, candidates: maximum, metadata });
    const selected = itemCandidates(sql, { type, states: unique, after }, { rows: limit, candidates: maximum, metadataBytes: metadata });
    if (!selected.ok) return budget.stop();
    const emitted = selected.rows.slice(0, limit);
    const bytes = emitted.reduce((sum, row) => sum + row.bytes, 0); // spend rejects any unsafe sum before bodies
    budget.spend({ calls: emitted.length, bytes });
    const items = emitted.map(row => {
      const rows = sql.exec("SELECT record FROM item WHERE id=? AND octet_length(record)=?", row.id, row.bytes).toArray();
      if (rows.length !== 1 || typeof rows[0]?.["record"] !== "string" || utf8(rows[0]["record"]).length !== row.bytes) return budget.stop();
      const item: unknown = parseStrict(rows[0]["record"]);
      if (!isItem(item) || item.id !== row.id || item.type !== type || !unique.includes(item.state) || canonicalize(item) !== rows[0]["record"]) return budget.stop();
      return item;
    });
    return { items, more: !selected.exhausted };
  };
  const methods = {
    scope: () => { budget.spend({ calls: 1 }); return snapshot; },
    page: (...args: Parameters<StateView["page"]>) => { try { return page(...args); } catch { return budget.stop(); } },
    incarnations: (scope: Parameters<StateView["incarnations"]>[0]) => {
      const found = incarnationEvidence(sql, scope, budget);
      // A two-incarnation witness is not a complete inventory. Invalid
      // native histories stop this supported callback path explicitly.
      return found.kind === "none" ? [] : found.kind === "one" ? [found.incarnation] : budget.stop();
    },
  };
  return new Proxy(Object.freeze(methods), { get(target, property) {
    return Object.prototype.hasOwnProperty.call(target, property) ? Reflect.get(target, property) : budget.stop();
  } }) as unknown as StateView;
}
