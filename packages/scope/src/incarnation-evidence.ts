/** Two primary-key seeks distinguish zero, one and multiple incarnations. */
import type { Incarnation, ScopeId } from "@generalbusiness/dap-contract";
import { canonicalize, isIncarnation, isScopeId, parseStrict, utf8 } from "@generalbusiness/artroom-bytes";
import { isObject } from "@generalbusiness/dap-derive";
import { PREPARATION_BOUNDS, PreparationBudget } from "./preparation-budget.ts";
import type { Sql } from "./sqlite.ts";

export type IncarnationEvidence = { kind: "none" } | { kind: "one"; incarnation: Incarnation } | { kind: "many"; witnesses: readonly [Incarnation, Incarnation] };
const range = (values: readonly string[]) => {
  const stem = canonicalize(values).slice(0, -1);
  // Native keys are canonical [scope,inc,subject]. ',' precedes '-' in
  // BINARY ordering. Jumping to '-' skips every subject of this prefix.
  return { lower: stem + ",", upper: stem + "-" };
};

export function incarnationEvidence(sql: Pick<Sql, "exec">, scope: ScopeId, budget: PreparationBudget): IncarnationEvidence {
  if (!isScopeId(scope)) return budget.stop();
  const whole = range([scope]);
  const seek = (lower: string): Incarnation | null => {
    budget.spend({ calls: 1, candidates: 1, metadata: PREPARATION_BOUNDS.keyBytes + 64 });
    const rows = sql.exec("SELECT CASE WHEN octet_length(f.key)<=? THEN f.key ELSE NULL END AS key, octet_length(f.value) AS bytes FROM folded AS f WHERE f.kind='observed' AND f.key>=? AND f.key<? ORDER BY f.key LIMIT 1", PREPARATION_BOUNDS.keyBytes, lower, whole.upper).toArray();
    if (rows.length > 1) return budget.stop();
    const row = rows[0];
    if (!row) return null;
    if (typeof row["key"] !== "string" || typeof row["bytes"] !== "number" || !Number.isSafeInteger(row["bytes"]) || row["bytes"] < 0) return budget.stop();
    const key: unknown = parseStrict(row["key"]);
    if (!Array.isArray(key) || key.length !== 3 || key[0] !== scope || !isIncarnation(key[1]) || typeof key[2] !== "string" || canonicalize(key) !== row["key"]) return budget.stop();
    budget.spend({ calls: 1, bytes: row["bytes"] });
    const bodies = sql.exec("SELECT value FROM folded WHERE kind='observed' AND key=? AND octet_length(value)=?", row["key"], row["bytes"]).toArray();
    if (bodies.length !== 1 || typeof bodies[0]?.["value"] !== "string" || utf8(bodies[0]["value"]).length !== row["bytes"]) return budget.stop();
    const value: unknown = parseStrict(bodies[0]["value"]);
    if (!isObject(value) || Object.keys(value).sort().join() !== "of,seq,subject" || !isObject(value["of"]) || Object.keys(value["of"]).sort().join() !== "inc,scope"
      || value["of"]["scope"] !== scope || value["of"]["inc"] !== key[1] || value["subject"] !== key[2]
      || typeof value["seq"] !== "number" || !Number.isSafeInteger(value["seq"]) || value["seq"] < 0 || canonicalize(value) !== bodies[0]["value"]) return budget.stop();
    return key[1];
  };
  try {
    const first = seek(whole.lower);
    if (first === null) return { kind: "none" };
    const second = seek(range([scope, first]).upper);
    if (second === null) return { kind: "one", incarnation: first };
    if (second <= first) return budget.stop();
    return { kind: "many", witnesses: [first, second] };
  } catch { return budget.stop(); }
}
