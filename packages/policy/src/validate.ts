/**
 * Policy and checker configuration validation (R-POL-1). A proposal whose
 * head has an invalid `.artroom/policy.json` or checker configuration is
 * refused with `policy-invalid`, so an invalid policy can never activate.
 * Every expression must pass the profile's admission checks (R-EVAL-1).
 */

import type { CheckerConfig, PolicyDocument, Refusal } from "@generalbusiness/artroom-contract";
import { admit } from "./evaluator.ts";
import { PolicyEvalError } from "./errors.ts";
import { globProblem } from "./glob.ts";
import { LEGACY_KINDS } from "./vocabulary.ts";

const RULE_ID = /^[a-z][a-z0-9-]{0,63}$/;
const MEMBER = /^@[a-z0-9][a-z0-9-]{0,38}$/;
const ROLES = new Set(["admin", "maintainer", "member", "agent", "checker"]);
/** A `v1` rule's `on` names legacy kinds, from the one source (vocabulary.ts). */
const KINDS: ReadonlySet<string> = new Set(LEGACY_KINDS);
/** Rule IDs the platform uses for its own obligations and refusals. */
const RESERVED_IDS = new Set(["admin-approval"]);

export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
export const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

export function isPrincipal(v: unknown): boolean {
  return typeof v === "string" && (MEMBER.test(v) || (v.startsWith("role:") && ROLES.has(v.slice(5))));
}

/** A list of validation problems, each `where: what`. Shared with the acts validator (acts.ts). */
export class Problems {
  readonly list: string[] = [];
  add(where: string, what: string) {
    this.list.push(`${where}: ${what}`);
  }
  keys(where: string, value: Obj, allowed: readonly string[]) {
    for (const key of Object.keys(value)) if (!allowed.includes(key)) this.add(where, `unknown field ${key}`);
  }
  globs(where: string, value: unknown, nonEmpty = false) {
    if (!Array.isArray(value)) return this.add(where, "must be an array of globs");
    if (nonEmpty && !value.length) this.add(where, "must not be empty");
    for (const g of value) {
      const problem = globProblem(g);
      if (problem) this.add(where, problem);
    }
  }
  list_of(where: string, value: unknown, ok: (v: unknown) => boolean, what: string) {
    if (!Array.isArray(value) || !value.length) return this.add(where, `must be a non-empty array of ${what}`);
    for (const v of value) if (!ok(v)) this.add(where, `${JSON.stringify(v)} is not ${what}`);
  }
  expr(where: string, value: unknown) {
    if (typeof value !== "string") return this.add(where, "must be a JSONata expression string");
    try {
      admit(value);
    } catch (error) {
      if (!(error instanceof PolicyEvalError)) throw error;
      this.add(where, `${error.code}: ${error.message}`);
    }
  }
}

function rule(p: Problems, r: unknown, i: number, seen: Set<string>, isKind: (k: unknown) => boolean) {
  const at = `rules[${i}]`;
  if (!isObj(r)) return p.add(at, "must be an object");
  if (typeof r["id"] !== "string" || !RULE_ID.test(r["id"])) p.add(at, "id must match [a-z][a-z0-9-]{0,63}");
  else if (RESERVED_IDS.has(r["id"])) p.add(at, `id ${r["id"]} is reserved by the platform`);
  else if (seen.has(r["id"])) p.add(at, `duplicate rule id ${r["id"]}`);
  else seen.add(r["id"]);
  if (r["description"] !== undefined && typeof r["description"] !== "string") p.add(at, "description must be a string");
  const base = ["id", "kind", "description"];
  switch (r["kind"]) {
    case "refuse":
      p.keys(at, r, [...base, "on", "refuse", "reason", "fix"]);
      p.list_of(`${at}.on`, r["on"], isKind, "an act kind");
      p.expr(`${at}.refuse`, r["refuse"]);
      if (!isText(r["reason"])) p.add(at, "reason must be a sentence");
      if (!isText(r["fix"])) p.add(at, "fix must be a sentence");
      break;
    case "require": {
      p.keys(at, r, [...base, "paths", "when", "obligation"]);
      p.globs(`${at}.paths`, r["paths"], true);
      if (r["when"] !== undefined) p.expr(`${at}.when`, r["when"]);
      const o = r["obligation"];
      if (!isObj(o)) {
        p.add(at, "obligation must be an object");
        break;
      }
      if (o["type"] === "review") {
        p.keys(`${at}.obligation`, o, ["type", "from", "count", "allowSelf"]);
        p.list_of(`${at}.obligation.from`, o["from"], (v) => v === "owners" || isPrincipal(v), "a principal or owners");
        if (!Number.isSafeInteger(o["count"]) || (o["count"] as number) < 1) p.add(at, "obligation.count must be an integer of at least 1");
        if (typeof o["allowSelf"] !== "boolean") p.add(at, "obligation.allowSelf must be true or false");
      } else if (o["type"] === "check") {
        p.keys(`${at}.obligation`, o, ["type", "check", "by"]);
        if (typeof o["check"] !== "string" || !RULE_ID.test(o["check"])) p.add(at, "obligation.check must be a checker name");
        p.list_of(`${at}.obligation.by`, o["by"], isPrincipal, "a principal");
      } else p.add(at, "obligation.type must be review or check");
      break;
    }
    case "carry":
      p.keys(at, r, [...base, "evidence", "allow"]);
      if (!["review", "check", "any"].includes(r["evidence"] as string)) p.add(at, "evidence must be review, check or any");
      p.expr(`${at}.allow`, r["allow"]);
      break;
    case "land":
      p.keys(at, r, [...base, "block", "reason", "fix"]);
      p.expr(`${at}.block`, r["block"]);
      if (!isText(r["reason"])) p.add(at, "reason must be a sentence");
      if (!isText(r["fix"])) p.add(at, "fix must be a sentence");
      break;
    case "notify":
      p.keys(at, r, [...base, "on", "when", "to", "why"]);
      p.list_of(`${at}.on`, r["on"], isKind, "an act kind");
      if (r["when"] !== undefined) p.expr(`${at}.when`, r["when"]);
      p.list_of(`${at}.to`, r["to"], (v) => v === "owners" || v === "holder" || v === "reviewers" || isPrincipal(v), "a notify target");
      if (!isText(r["why"])) p.add(at, "why must be a sentence");
      break;
    default:
      p.add(at, "kind must be refuse, require, carry, land or notify");
  }
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly string[]; readonly refusal: Refusal };

export function result<T>(p: Problems, value: unknown, what: string): Validation<T> {
  if (!p.list.length) return { ok: true, value: value as T };
  return {
    ok: false,
    problems: p.list,
    refusal: {
      refused: true,
      rule: "policy-invalid",
      reason: `The proposed ${what} is invalid: ${p.list[0]}${p.list.length > 1 ? ` (and ${p.list.length - 1} more)` : ""}.`,
      fix: `Correct the ${what} and propose again.`,
    },
  };
}

/** Check a candidate `.artroom/policy.json` against `PolicyDocument` and the profile. */
export function validatePolicy(doc: unknown): Validation<PolicyDocument> {
  const p = new Problems();
  if (!isObj(doc)) {
    p.add("policy", "must be a JSON object");
    return result(p, doc, "policy");
  }
  p.keys("policy", doc, ["format", "profile", "owners", "carry", "lanes", "retiredEvidence", "rules"]);
  if (doc["format"] !== "artroom-policy-v1") p.add("format", "must be artroom-policy-v1");
  if (doc["profile"] !== "artroom-jsonata-v1") p.add("profile", "must be artroom-jsonata-v1");
  documentFields(p, doc, (k) => typeof k === "string" && KINDS.has(k));
  return result(p, doc, "policy");
}

/**
 * The fields `v1` and `v2` documents share: owners, carry, lanes,
 * retiredEvidence and rules. `isKind` decides which names a rule's `on` may
 * use: the fixed list for `v1`, declared and platform kinds for `v2`.
 */
export function documentFields(p: Problems, doc: Obj, isKind: (k: unknown) => boolean): void {
  const owners = doc["owners"];
  if (!isObj(owners)) p.add("owners", "must be an object");
  else
    for (const [g, who] of Object.entries(owners)) {
      const problem = globProblem(g);
      if (problem) p.add("owners", problem);
      p.list_of(`owners[${g}]`, who, isPrincipal, "a principal");
    }
  const carry = doc["carry"];
  if (!isObj(carry)) p.add("carry", "must be an object");
  else {
    p.keys("carry", carry, ["verdicts", "checks", "globalInputs", "dependsOn"]);
    if (typeof carry["verdicts"] !== "boolean") p.add("carry.verdicts", "must be true or false");
    if (typeof carry["checks"] !== "boolean") p.add("carry.checks", "must be true or false");
    p.globs("carry.globalInputs", carry["globalInputs"]);
    const deps = carry["dependsOn"];
    if (!isObj(deps)) p.add("carry.dependsOn", "must be an object");
    else
      for (const [g, list] of Object.entries(deps)) {
        const problem = globProblem(g);
        if (problem) p.add("carry.dependsOn", problem);
        p.globs(`carry.dependsOn[${g}]`, list);
      }
  }
  if (doc["lanes"] !== "by-scope" && doc["lanes"] !== "exclusive") p.add("lanes", "must be by-scope or exclusive");
  if (doc["retiredEvidence"] !== "counts" && doc["retiredEvidence"] !== "reopens") p.add("retiredEvidence", "must be counts or reopens");
  const rules = doc["rules"];
  if (!Array.isArray(rules)) p.add("rules", "must be an array");
  else {
    const seen = new Set<string>();
    rules.forEach((r, i) => rule(p, r, i, seen, isKind));
  }
}

/** Check a candidate `.artroom/checkers/<name>.json` (R-CARRY-7). */
export function validateCheckerConfig(config: unknown): Validation<CheckerConfig> {
  const p = new Problems();
  if (!isObj(config)) {
    p.add("checker", "must be a JSON object");
    return result(p, config, "checker configuration");
  }
  p.keys("checker", config, ["format", "inputs", "volatile", "timeoutSeconds", "advisory", "runner"]);
  if (config["format"] !== "artroom-checker-v1") p.add("format", "must be artroom-checker-v1");
  checkerFields(p, config);
  return result(p, config, "checker configuration");
}

/** The fields `artroom-checker-v1` and `artroom-checker-v2` share. */
export function checkerFields(p: Problems, config: Obj): void {
  if (config["inputs"] !== undefined) p.globs("inputs", config["inputs"], true);
  if (typeof config["volatile"] !== "boolean") p.add("volatile", "must be true or false");
  const t = config["timeoutSeconds"];
  if (!Number.isSafeInteger(t) || (t as number) < 1) p.add("timeoutSeconds", "must be a positive integer");
  // Amendment 3 (bc351fa8): advisory checkers and a pinned runner environment (R-OBL-7, R-EXEC-11).
  if (config["advisory"] !== undefined && typeof config["advisory"] !== "boolean") p.add("advisory", "must be true or false");
  if (config["runner"] !== undefined && (typeof config["runner"] !== "string" || !/^sha256:[0-9a-f]{64}$/.test(config["runner"]))) {
    p.add("runner", "must be a sha256: digest of 64 lowercase hex characters");
  }
}
