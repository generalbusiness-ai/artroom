/**
 * Contract amendment 3 (bc351fa8), through the types only. Compiled, never run.
 *
 * The Room issues a filtered check job for a scoped checker (R-EXEC-8 to
 * R-EXEC-10, R-CARRY-15), and records whether an earlier check carries
 * (R-CARRY-13).
 */

import type {
  ActId,
  CheckerConfig,
  CheckerName,
  CheckerService,
  CheckJob,
  Digest,
  GitAuthEnv,
  Glob,
  LaneId,
  ObligationId,
  OpId,
  PolicyVersion,
  RoomId,
  Sha,
  SnapshotIdentity,
  SnapshotMessage,
  SystemEvent,
} from "@generalbusiness/artroom-contract";

declare function show(message: string): void;

/** The fixed author and committer of every snapshot commit. */
export const identity: SnapshotIdentity = "Artroom Snapshot <snapshot@artroom.invalid> 0 +0000";

export function snapshotMessage(checker: CheckerName, digest: Digest): SnapshotMessage {
  return `Artroom filtered snapshot for ${checker}\n\nDigest: ${digest}\n`;
}

/** Git's credential: exactly one read-only bearer header (R-EXEC-9). */
export function gitAuthEnv(token: string): GitAuthEnv {
  return { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}` };
}

/** A filtered job: `integration` is the recorded snapshot commit; the rest comes from the configuration. */
export async function issue(
  service: CheckerService,
  at: { readonly room: RoomId; readonly lane: LaneId; readonly obligation: ObligationId; readonly head: Sha; readonly expectedMain: Sha },
  snapshot: { readonly commit: Sha; readonly digest: Digest; readonly paths: readonly Glob[]; readonly readUrl: `https://${string}` },
  checker: { readonly name: CheckerName; readonly config: CheckerConfig; readonly digest: Digest },
  token: string,
): Promise<void> {
  const job: CheckJob = {
    id: "job_example",
    room: at.room,
    lane: at.lane,
    generation: 2,
    head: at.head,
    obligation: at.obligation,
    check: checker.name,
    integration: snapshot.commit,
    base: at.expectedMain,
    input: { kind: "filtered", snapshot: snapshot.digest, paths: snapshot.paths },
    readUrl: snapshot.readUrl,
    gitAuthEnv: gitAuthEnv(token),
    config: checker.digest,
    volatile: checker.config.volatile,
    advisory: checker.config.advisory ?? false,
    runner: checker.config.runner ?? null,
    deadline: "2026-10-01T00:10:00.000Z",
  };
  const out = await service.handle(job);
  show("refused" in out ? `${out.rule}: ${out.reason}` : `check ${out.id} recorded`);
}

/** A check carry judgment, as the Room seals it (R-CARRY-13). */
export function notCarried(op: OpId, lane: LaneId, integration: Sha, obligation: ObligationId, act: ActId, policy: PolicyVersion): SystemEvent {
  return {
    type: "check-carried",
    op,
    lane,
    generation: 2,
    integration,
    obligation,
    act,
    policy,
    outcome: { carried: false, notCarried: { act, code: "runner-changed", text: "No runner environment is pinned." } },
    decisions: [],
  };
}
