/**
 * The TypeScript authoring helpers declared in the contract's `/policy`
 * subpath. Each is typed as `typeof` the contract's declaration, so a
 * signature drift fails the typecheck. They compile to `PolicyDocument`.
 *
 * Once lane 0 lands, the contract's `/policy` subpath can replace its
 * `export declare function` lines with a re-export from
 * `@generalbusiness/artroom-policy/helpers`.
 */

import type * as Contract from "@generalbusiness/artroom-contract/policy";
import type {
  CarryRule,
  CarrySettings,
  Glob,
  LandRule,
  PolicyDocument,
  PolicyPart,
  Principal,
  RefuseRule,
  RequireRule,
  Rule,
} from "@generalbusiness/artroom-contract";
import { validatePolicy } from "./validate.ts";

const arr = <T>(v: T | readonly T[]): readonly T[] => (Array.isArray(v) ? (v as readonly T[]) : [v as T]);

/** The default land rule (R-POL-7). It assumes `reviews` lists each qualifying reviewer's latest verdict. */
export const OBJECTION_OPEN: LandRule = Object.freeze({
  id: "objection-open",
  kind: "land",
  description: "Blocks while any qualifying reviewer's latest verdict on this generation is an objection.",
  block: '$count(reviews[verdict = "object"]) > 0',
  reason: "A qualifying reviewer's latest verdict on this generation is an objection.",
  fix: "Resolve the objection, or ask the reviewer to approve a new generation.",
});

const DEFAULT_CARRY: CarrySettings = Object.freeze({ verdicts: true, checks: true, globalInputs: [], dependsOn: {} });

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function defaultId(prefix: string, paths: readonly Glob[]): string {
  const tail = slug(paths.join(" ")) || "all";
  return `${prefix}-${tail}`.slice(0, 64).replace(/-+$/, "");
}

/** Merge parts in order; a later setting replaces an earlier one. Adds `objection-open` unless defined. */
export const policy: typeof Contract.policy = (...parts) => {
  let owners: Record<Glob, readonly Principal[]> = {};
  let carry: CarrySettings = DEFAULT_CARRY;
  let lanes: PolicyDocument["lanes"] = "by-scope";
  let retiredEvidence: PolicyDocument["retiredEvidence"] = "counts";
  const rules: Rule[] = [];
  for (const part of parts) {
    switch (part.part) {
      case "owners":
        owners = { ...owners, ...part.owners };
        break;
      case "carry":
        carry = { ...carry, ...part.carry };
        rules.push(...part.rules);
        break;
      case "lanes":
        lanes = part.lanes;
        break;
      case "evidence":
        retiredEvidence = part.retiredEvidence;
        break;
      case "rules":
        rules.push(...part.rules);
        break;
    }
  }
  if (!rules.some((r) => r.id === OBJECTION_OPEN.id)) rules.push(OBJECTION_OPEN);
  const doc: PolicyDocument = { format: "artroom-policy-v1", profile: "artroom-jsonata-v1", owners, carry, lanes, retiredEvidence, rules };
  const checked = validatePolicy(doc);
  if (!checked.ok) throw new TypeError(`Invalid policy: ${checked.problems.join("; ")}`);
  return doc;
};

export const owners: typeof Contract.owners = (map) => ({
  part: "owners",
  owners: Object.fromEntries(Object.entries(map).map(([g, who]) => [g, arr(who)])),
});

export const requireCheck: typeof Contract.requireCheck = (check, opts) => {
  const rule: RequireRule = {
    id: opts.id ?? `check-${check}`,
    kind: "require",
    paths: arr(opts.paths),
    ...(opts.when !== undefined ? { when: opts.when } : {}),
    obligation: { type: "check", check, by: arr(opts.by) },
  };
  return { part: "rules", rules: [rule] };
};

export const requireReview: typeof Contract.requireReview = (opts) => {
  const paths = arr(opts.paths);
  const rule: RequireRule = {
    id: opts.id ?? defaultId("review", paths),
    kind: "require",
    paths,
    ...(opts.when !== undefined ? { when: opts.when } : {}),
    obligation: { type: "review", from: arr(opts.from), count: opts.count ?? 1, allowSelf: opts.allowSelf ?? false },
  };
  return { part: "rules", rules: [rule] };
};

export const carry: typeof Contract.carry = (opts) => {
  const settings: Partial<CarrySettings> = {
    ...(opts.verdicts !== undefined ? { verdicts: opts.verdicts } : {}),
    ...(opts.checks !== undefined ? { checks: opts.checks } : {}),
    ...(opts.globalInputs !== undefined ? { globalInputs: opts.globalInputs } : {}),
    ...(opts.dependsOn !== undefined ? { dependsOn: opts.dependsOn } : {}),
  };
  const rules: CarryRule[] = (opts.allow ?? []).map((a) => ({ id: a.id, kind: "carry", evidence: a.evidence, allow: a.allow }));
  return { part: "carry", carry: settings, rules };
};

export const lanes: typeof Contract.lanes = (mode) => ({ part: "lanes", lanes: mode });

export const rule: typeof Contract.rule = (spec) => {
  if ("kind" in spec) return { part: "rules", rules: [spec] };
  const refuse: RefuseRule = {
    id: spec.id,
    kind: "refuse",
    on: arr(spec.on),
    refuse: spec.refuse,
    reason: spec.reason ?? `Policy rule ${spec.id} refused this act.`,
    fix: spec.fix,
  };
  return { part: "rules", rules: [refuse] };
};

/** The policy a room uses with no policy file (R-POL-7). */
export function defaultPolicy(): PolicyDocument {
  return policy();
}

/** Not declared by the contract: sets `retiredEvidence` (R-REV-2). Returns the contract's `evidence` part. */
export function retiredEvidence(mode: PolicyDocument["retiredEvidence"]): PolicyPart {
  return { part: "evidence", retiredEvidence: mode };
}
