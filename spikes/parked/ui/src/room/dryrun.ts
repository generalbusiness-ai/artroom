/**
 * Dry run of a draft rule against recorded history (plan section 12, the
 * Policy screen). Every outcome comes from the policy runtime
 * (@generalbusiness/artroom-policy): the room's recorded rule inputs are
 * evaluated once under the active policy and once under the active policy
 * plus the draft, and the screen lists each act whose outcome differs. The
 * preview and the rule a user would adopt are therefore the same thing.
 *
 * A draft that cannot be written faithfully as a rule is reported as such;
 * nothing is replayed for it.
 */

import { admit, evaluate, evaluateCarry, evaluateRefuse, evaluateRequire, globsOverlap, STAMP, validatePolicy, type ActivePolicy } from "@generalbusiness/artroom-policy";
import type { DraftRule, DryRunChange, DryRunMismatch, DryRunResult } from "./adapter.ts";
import type { PolicyDocument, PolicyVersion, Rule } from "./contract.ts";
import type { History } from "./mock/world.ts";
import { compileTargets, refuseClaimExpr } from "./refuse-claim.ts";

type Compiled =
  | { readonly doc: PolicyDocument; readonly shown: Rule | { readonly carry: Record<string, unknown> } }
  | { readonly problem: string; readonly fix: string; readonly problems?: readonly string[] };

/**
 * The active policy with the draft added, as `.artroom/policy.json` would
 * hold it, and only if the policy runtime would accept that whole document
 * (validatePolicy, R-POL-1). A document the room would refuse is never
 * evaluated, so no prediction is made for it.
 */
export function compileDraft(draft: DraftRule, doc: PolicyDocument): Compiled {
  const built = build(draft, doc);
  if ("problem" in built) return built;
  const valid = validatePolicy(built.doc);
  if (!valid.ok)
    return {
      problem: `The policy with this draft would be refused (${valid.refusal.rule}): ${valid.refusal.reason}`,
      fix: "Change the draft so the whole policy is valid: a new rule ID, and patterns made only of literal text, * and **.",
      problems: valid.problems,
    };
  return built;
}

function build(draft: DraftRule, doc: PolicyDocument): Compiled {
  switch (draft.kind) {
    case "require-review": {
      const rule: Rule = { id: draft.id, kind: "require", paths: draft.paths, obligation: { type: "review", from: [draft.from], count: draft.count, allowSelf: false } };
      return { doc: { ...doc, rules: [...doc.rules, rule] }, shown: rule };
    }
    case "refuse-claim": {
      const c = compileTargets(draft.paths);
      if ("problem" in c)
        return {
          problem: `${c.problem} The policy language has no glob function, so a refuse rule can only test literal paths and whole directories exactly.`,
          fix: "Use literal paths, or directories written as dir/**.",
        };
      const rule: Rule = {
        id: draft.id,
        kind: "refuse",
        on: ["claim"],
        refuse: refuseClaimExpr(draft.roles, c.targets),
        reason: `Members with the role ${draft.roles.join(" or ")} may not claim ${draft.paths.join(", ")}.`,
        fix: `Leave ${draft.paths.join(", ")} out of the claim, or ask a person to claim it.`,
      };
      try {
        admit(rule.refuse);
      } catch (error) {
        return { problem: `The compiled expression is outside the policy profile: ${String((error as Error).message)}`, fix: "Use fewer or shorter paths." };
      }
      return { doc: { ...doc, rules: [...doc.rules, rule] }, shown: rule };
    }
    case "carry-depends-on": {
      const dependsOn = { ...doc.carry.dependsOn, [draft.area]: [...(doc.carry.dependsOn[draft.area] ?? []), ...draft.dependsOn] };
      return { doc: { ...doc, carry: { ...doc.carry, dependsOn } }, shown: { carry: { dependsOn: { [draft.area]: draft.dependsOn } } } };
    }
    case "global-input":
      return { doc: { ...doc, carry: { ...doc.carry, globalInputs: [...doc.carry.globalInputs, ...draft.paths] } }, shown: { carry: { globalInputs: draft.paths } } };
  }
}

export async function dryRun(history: History, draft: DraftRule, doc: PolicyDocument, version: PolicyVersion): Promise<DryRunResult> {
  const compiled = compileDraft(draft, doc);
  if ("problem" in compiled) return { status: "not-compiled", reason: compiled.problem, fix: compiled.fix, problems: compiled.problems ?? [] };
  const before: ActivePolicy = { doc, version };
  const after: ActivePolicy = { doc: compiled.doc, version };
  const changes: DryRunChange[] = [];
  const mismatches: DryRunMismatch[] = [];

  if (draft.kind === "refuse-claim") {
    const rule = compiled.shown as Extract<Rule, { kind: "refuse" }>;
    for (const c of history.claims) {
      const [was, now] = await Promise.all([evaluateRefuse(before, c.input), evaluateRefuse(after, c.input)]);
      if (!was.refusal && now.refusal)
        changes.push({ seq: c.seq, act: c.act, ...(c.lane ? { lane: c.lane } : {}), by: c.by, what: "Claim", before: "Accepted", after: `Refused by ${now.refusal.rule}: ${now.refusal.reason}` });
      // Compare the rule with path overlap, so the screen can say where the expression differs.
      const scope = (c.input.act.body as { scope?: string[] }).scope ?? [];
      const roleOk = c.input.actor.role !== null && draft.roles.includes(c.input.actor.role);
      if (!roleOk) continue;
      const overlaps = scope.some((s) => draft.paths.some((p) => globsOverlap(s, p)));
      const refuses = (await evaluate(rule.refuse, c.input)).value === true;
      if (overlaps !== refuses) mismatches.push({ seq: c.seq, act: c.act, by: c.by, scope, kind: overlaps ? "missed" : "extra" });
    }
  }

  if (draft.kind === "require-review") {
    for (const p of history.proposals) {
      const [was, now] = await Promise.all([evaluateRequire(before, p.input), evaluateRequire(after, p.input)]);
      const had = new Set(was.obligations.map((o) => o.id));
      for (const o of now.obligations) {
        if (had.has(o.id)) continue;
        changes.push({
          seq: p.seq,
          act: p.act,
          lane: p.lane,
          generation: p.generation,
          by: p.by,
          what: `Generation ${p.generation}`,
          before: was.obligations.length ? `Needed: ${was.obligations.map((x) => x.rule).join(", ")}` : "No obligations",
          after: `Would also need ${o.kind === "review" ? `${o.count === 1 ? "an approval" : `${o.count} approvals`} from ${o.from.join(", ")}` : `the ${o.check} check`} for ${o.paths.join(", ")}`,
        });
      }
    }
  }

  if (draft.kind === "carry-depends-on" || draft.kind === "global-input") {
    for (const c of history.carries) {
      const [was, now] = await Promise.all([evaluateCarry(before, c.input), evaluateCarry(after, c.input)]);
      if (was.carried && now.notCarried)
        changes.push({
          seq: c.seq,
          act: c.act,
          lane: c.lane,
          generation: c.to,
          by: c.by,
          what: `${c.by}'s approval of generation ${c.from}`,
          before: `Carried to generation ${c.to}`,
          after: `Would not carry: ${now.notCarried.text.replace(/^not carried: /, "")}`,
        });
      if (!was.carried && now.carried)
        changes.push({ seq: c.seq, act: c.act, lane: c.lane, generation: c.to, by: c.by, what: `${c.by}'s approval of generation ${c.from}`, before: "Did not carry", after: "Would carry" });
    }
  }

  return {
    status: "replayed",
    compiled: compiled.shown,
    stamp: `${STAMP.profile}, jsonata ${STAMP.jsonata}`,
    examined: { claims: history.claims.length, proposals: history.proposals.length, carried: history.carries.length },
    changes,
    mismatches,
  };
}
