/**
 * "Refuse claims on these paths by members with these roles", compiled to an
 * `artroom-jsonata-v1` expression.
 *
 * The profile has no glob function, so the expression cannot test glob
 * overlap (R-PATH-3) itself. It tests what it can say exactly, using only
 * `$substring` and comparison: a claimed pattern is caught when it equals a
 * target, starts with the target's directory, or has a wildcard where its
 * literal text still agrees with the target. That catches `**`, `m*`,
 * `migrations/**` and `migrations/x.sql` for the target `migrations/**`.
 *
 * Only two shapes of target compile: a literal path, and a literal directory
 * followed by `/**`. Anything else is reported as not compilable.
 *
 * `refusesClaimTwin` gives the same answer in TypeScript, for the mock
 * room's synchronous admission. Tests compare it with the real evaluator.
 */

import type { Glob, Role } from "./contract.ts";
import { globProblem } from "./glob.ts";

type Target = { readonly exact: string; readonly under: string; readonly literal: string };

/** The literal target of a pattern, or why it cannot be compiled. */
export function targetOf(pattern: Glob): Target | { readonly problem: string } {
  const bad = globProblem(pattern);
  if (bad) return { problem: `${pattern} is not a valid pattern: ${bad}.` };
  if (!pattern.includes("*")) return { exact: pattern, under: `${pattern}/`, literal: pattern };
  const dir = pattern.slice(0, -3);
  if (pattern.endsWith("/**") && !dir.includes("*")) return { exact: dir, under: `${dir}/`, literal: `${dir}/` };
  return { problem: `${pattern} is neither a literal path nor a directory followed by /**.` };
}

const q = (s: string) => JSON.stringify(s);
const cps = (s: string) => Array.from(s);

function terms(t: Target): string[] {
  const lit = cps(t.literal);
  const out = [`$ = ${q(t.exact)}`, `$substring($, 0, ${cps(t.under).length}) = ${q(t.under)}`, `$substring($, 0, 1) = "*"`];
  for (let k = 1; k <= lit.length; k++) out.push(`($substring($, 0, ${k}) = ${q(lit.slice(0, k).join(""))} and $substring($, ${k}, 1) = "*")`);
  return out;
}

/** The refuse expression. Literal text is quoted as JSON strings, which JSONata reads the same way. */
export function refuseClaimExpr(roles: readonly Role[], targets: readonly Target[]): string {
  const any = targets.flatMap(terms).join(" or ");
  return `actor.role in [${roles.map(q).join(", ")}] and $count(act.body.scope[${any}]) > 0`;
}

const sub = (s: string, start: number, length: number) => cps(s).slice(start, start + length).join("");

function caught(scope: string, t: Target): boolean {
  if (scope === t.exact) return true;
  if (sub(scope, 0, cps(t.under).length) === t.under) return true;
  if (sub(scope, 0, 1) === "*") return true;
  const lit = cps(t.literal);
  for (let k = 1; k <= lit.length; k++) if (sub(scope, 0, k) === lit.slice(0, k).join("") && sub(scope, k, 1) === "*") return true;
  return false;
}

/** The expression's answer, in TypeScript. */
export function refusesClaimTwin(roles: readonly Role[], targets: readonly Target[], role: Role | null, scope: readonly Glob[]): boolean {
  return role !== null && roles.includes(role) && scope.some((s) => targets.some((t) => caught(s, t)));
}

/** Compile every pattern, or return the first problem. */
export function compileTargets(patterns: readonly Glob[]): { readonly targets: Target[] } | { readonly problem: string } {
  const targets: Target[] = [];
  for (const p of patterns) {
    const t = targetOf(p);
    if ("problem" in t) return t;
    targets.push(t);
  }
  return { targets };
}
