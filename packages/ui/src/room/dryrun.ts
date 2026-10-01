/**
 * Dry run of a draft rule against recorded history (plan section 12, the
 * Policy screen). It replays the facts the room recorded: claims, proposals'
 * changed paths, and each carry decision's inputs. It reports every act whose
 * outcome the draft would change.
 */

import type { DraftRule, DryRunChange, DryRunResult } from "./adapter.ts";
import type { Rule } from "./contract.ts";
import { matchesAny, overlap } from "./glob.ts";
import type { History } from "./mock/world.ts";

const prefixOf = (glob: string) => glob.replace(/\/?\*\*.*$/, "").replace(/\*.*$/, "");

/** The draft as the policy file would hold it. */
export function compileDraft(draft: DraftRule): DryRunResult["compiled"] {
  switch (draft.kind) {
    case "require-review":
      return {
        id: draft.id,
        kind: "require",
        paths: draft.paths,
        obligation: { type: "review", from: [draft.from], count: draft.count, allowSelf: false },
      } satisfies Rule;
    case "refuse-claim": {
      const roles = draft.roles.map((r) => `"${r}"`).join(", ");
      const tests = draft.paths.map((p) => `$contains($, "${prefixOf(p)}")`).join(" or ");
      return {
        id: draft.id,
        kind: "refuse",
        on: ["claim"],
        refuse: `actor.role in [${roles}] and $count(act.body.scope[${tests}]) > 0`,
        reason: `${draft.roles.join(" and ")} members may not claim ${draft.paths.join(", ")}.`,
        fix: `Leave ${draft.paths.join(", ")} out of the claim, or ask a person to claim it.`,
      } satisfies Rule;
    }
    case "carry-depends-on":
      return { carry: { dependsOn: { [draft.area]: draft.dependsOn } } };
    case "global-input":
      return { carry: { globalInputs: draft.paths } };
  }
}

export function dryRun(history: History, draft: DraftRule): DryRunResult {
  const changes: DryRunChange[] = [];
  switch (draft.kind) {
    case "require-review":
      for (const p of history.proposals) {
        const hit = p.paths.filter((path) => matchesAny(path, draft.paths));
        if (!hit.length) continue;
        changes.push({
          seq: p.seq,
          act: p.act,
          lane: p.lane,
          generation: p.generation,
          by: p.by,
          what: `Generation ${p.generation}`,
          before: p.obligations.length ? `Needed: ${p.obligations.join(", ")}` : "No obligations",
          after: `Would also need ${draft.count} ${draft.count === 1 ? "approval" : "approvals"} from ${draft.from} for ${hit.join(", ")}`,
        });
      }
      break;
    case "refuse-claim":
      for (const c of history.claims) {
        if (c.refused || !draft.roles.includes(c.role)) continue;
        const hit = c.scope.filter((g) => draft.paths.some((d) => overlap(g, d)));
        if (!hit.length) continue;
        changes.push({
          seq: c.seq,
          act: c.act,
          ...(c.lane ? { lane: c.lane } : {}),
          by: c.by,
          what: "Claim",
          before: "Accepted",
          after: `Refused by ${draft.id}: the claim covers ${hit.join(", ")}`,
        });
      }
      break;
    case "carry-depends-on":
    case "global-input":
      for (const c of history.carries) {
        if (!c.carried) continue;
        let hit: string[] = [];
        let because = "";
        if (draft.kind === "carry-depends-on") {
          if (!c.scope.some((s) => overlap(s, draft.area))) continue;
          hit = c.changedSince.filter((p) => matchesAny(p, draft.dependsOn));
          because = `the draft makes ${draft.dependsOn.join(", ")} a dependency of ${draft.area}`;
        } else {
          hit = c.changedSince.filter((p) => matchesAny(p, draft.paths));
          because = "the draft makes it a global input";
        }
        if (!hit.length) continue;
        changes.push({
          seq: c.seq,
          act: c.act,
          lane: c.lane,
          generation: c.to,
          by: c.by,
          what: `${c.by}'s approval of generation ${c.from}`,
          before: `Carried to generation ${c.to}`,
          after: `Would not carry: ${hit.join(", ")} changed, and ${because}`,
        });
      }
      break;
  }
  return {
    compiled: compileDraft(draft),
    examined: { claims: history.claims.length, proposals: history.proposals.length, carried: history.carries.length },
    changes,
  };
}
