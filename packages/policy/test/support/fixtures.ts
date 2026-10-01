/** Builders for recorded rule inputs. Values are plain JSON, as the room records them. */

import type {
  ActId,
  Glob,
  MemberId,
  PathChange,
  PolicyActor,
  PolicyDocument,
  PolicyLane,
  PolicyVersion,
  RepoPath,
  Role,
  Sha,
} from "@generalbusiness/artroom-contract";
import type { InputOf, ProposalInput } from "../../src/inputs.ts";
import type { ActivePolicy } from "../../src/rules.ts";
import type { CarryInput } from "../../src/carry.ts";
import { ownersFor } from "../../src/rules.ts";

export const sha = (c: string): Sha => c.repeat(40).slice(0, 40) as Sha;
export const act = (n: number): ActId => `act_${n}_0000000${n % 10}`;
export const V1: PolicyVersion = act(1);
export const V2: PolicyVersion = act(2);

export const active = (doc: PolicyDocument, version: PolicyVersion = V1): ActivePolicy => ({ doc, version });

export function actor(member: MemberId | null, role: Role | null = "member", teams: readonly `@${string}`[] = []): PolicyActor {
  return { member, role, teams, delegated: false };
}

export function lane(holder: MemberId | null = "@alice", claimed = true): PolicyLane {
  return { id: act(10), claimed, holder, scope: ["src/**"], generation: 1 };
}

export function proposal(doc: PolicyDocument, paths: readonly RepoPath[], generation = 1): ProposalInput {
  const changed: PathChange[] = paths.map((path) => ({ status: "modified", path }));
  return { generation, head: sha("b"), base: sha("a"), changed, paths, owners: ownersFor(doc, paths) };
}

export const room = { admins: 1, members: 3 };

export function refuseInput(_doc: PolicyDocument, kind: InputOf<"refuse">["act"]["kind"], over: Partial<InputOf<"refuse">> = {}): InputOf<"refuse"> {
  return { kind: "refuse", act: { kind, target: null, body: {} }, actor: actor("@alice"), lane: lane(), proposal: null, room, ...over };
}

export function requireInput(doc: PolicyDocument, paths: readonly RepoPath[]): InputOf<"require"> {
  return { kind: "require", actor: actor("@alice"), lane: lane(), proposal: proposal(doc, paths), room };
}

export function landInput(
  doc: PolicyDocument,
  paths: readonly RepoPath[],
  reviews: InputOf<"land">["reviews"] = [],
): InputOf<"land"> {
  return { kind: "land", actor: actor("@alice"), lane: lane(), proposal: proposal(doc, paths, 2), obligations: [], reviews, stage: "land" };
}

export function notifyInput(doc: PolicyDocument, kind: InputOf<"notify">["act"]["kind"], paths: readonly RepoPath[] | null): InputOf<"notify"> {
  return { kind: "notify", act: { id: act(20), kind, target: null, body: {} }, actor: actor("@alice"), lane: lane(), proposal: paths ? proposal(doc, paths) : null };
}

export function carryInput(
  doc: PolicyDocument,
  opts: {
    kind?: "review" | "check";
    scope?: readonly Glob[];
    dependsOn?: readonly Glob[];
    changedSince: readonly RepoPath[];
    same?: boolean;
    by?: MemberId;
  },
): CarryInput {
  return {
    kind: "carry",
    evidence: {
      act: act(30),
      kind: opts.kind ?? "review",
      verdict: (opts.kind ?? "review") === "review" ? "approve" : null,
      by: actor(opts.by ?? "@bob"),
      from: { generation: 1, head: sha("1") },
      scope: opts.scope ?? [],
      dependsOn: opts.dependsOn ?? [],
    },
    changedSince: opts.changedSince,
    proposal: proposal(doc, opts.changedSince, 2),
    policy: { same: opts.same ?? true },
  };
}
