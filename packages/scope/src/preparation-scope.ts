/** The current metadata row is bounded before any transfer or parsing. */
import { canonicalize, isDigest, isFactRef, isScopeRef, parseStrict } from "@generalbusiness/artroom-bytes";
import { isObject, timeMs, type ScopeState } from "@generalbusiness/dap-derive";
import { PreparationBudget } from "./preparation-budget.ts";
import type { Sql } from "./sqlite.ts";

export const PREPARATION_SCOPE_BYTES = 4096;
export type PreparationScope = { kind: "scope"; scope: ScopeState } | { kind: "missing" | "unavailable" };
const integer = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const keys = (v: object, expected: string) => Object.keys(v).sort().join() === expected;
const freeze = (value: unknown): void => { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } };

export function preparationScope(sql: Pick<Sql, "exec">, budget: PreparationBudget): PreparationScope {
  const unavailable = (): PreparationScope => { budget.invalidate(); return { kind: "unavailable" }; };
  try {
    budget.spend({ calls: 1, candidates: 1, metadata: PREPARATION_SCOPE_BYTES });
    const rows = sql.exec("SELECT CASE WHEN octet_length(v)<=? THEN v ELSE NULL END AS v FROM meta WHERE k='scope'", PREPARATION_SCOPE_BYTES).toArray();
    if (rows.length > 1) return unavailable();
    if (!rows[0]) return { kind: "missing" };
    if (typeof rows[0]["v"] !== "string") return unavailable();
    const value: unknown = parseStrict(rows[0]["v"]);
    if (!isObject(value) || !keys(value, "at,creator,genesis,head,held,status,time") || !isScopeRef(value["at"])
      || !(value["creator"] === null || isScopeRef(value["creator"])) || !["active", "provisional", "refused"].includes(value["status"] as string)
      || typeof value["time"] !== "string" || timeMs(value["time"]) === null
      || !isObject(value["head"]) || !keys(value["head"], "hash,seq") || !integer(value["head"]["seq"]) || !isDigest(value["head"]["hash"])
      || !isObject(value["genesis"]) || !keys(value["genesis"], "hash,n,source") || !isDigest(value["genesis"]["hash"])
      || !(value["genesis"]["source"] === null || isFactRef(value["genesis"]["source"])) || !(value["genesis"]["n"] === null || integer(value["genesis"]["n"]))
      || !Array.isArray(value["held"]) || !value["held"].every(integer) || canonicalize(value) !== rows[0]["v"]
      || (value["head"]["seq"] === 0 && value["head"]["hash"] !== value["genesis"]["hash"])) return unavailable();
    freeze(value); return { kind: "scope", scope: value as unknown as ScopeState };
  } catch { return unavailable(); }
}
