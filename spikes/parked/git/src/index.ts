/**
 * @generalbusiness/artroom-git
 *
 * Artroom's git engine (plan sections 6 and 8, lane B):
 * - lane forks and fork-scoped, lease-bound tokens (`Workspaces`);
 * - pinned heads and merge previews in the publisher sandbox (`Pinning`);
 * - bounded, hash-cached path diffs through the Artifacts binding
 *   (`changedPaths`, `previewPlan`);
 * - the durable landing operation (`Landing`);
 * - the canonical mint ledger (`MintLedger`, protocol section 32);
 * - the lane forks' read-token ledger (`ForkTokens`, request 02836f9a),
 *   which `Workspaces` owns.
 *
 * The publisher's Durable Object and gateway classes are in `./publisher`
 * (`Publisher`, `ArtifactsGateway`), because they need the Workers runtime.
 * The Room Worker hosts them.
 */

export { Landing, EngineStopped, PUBLICATION_TTL_S, publicationTokens } from "./landing/engine.ts";
export type { FaultPoint, LandingOptions, PublicationToken, PublicationTokens, PublisherPort } from "./landing/engine.ts";
export { LandingCore, retryFix, toView, FORWARD_BACKOFF, UNEXPECTED_READBACK_MS } from "./landing/core.ts";
export type { IntegrateResult, PushPlan } from "./landing/core.ts";
export type {
  AcceptInput,
  LaneFacts,
  LandRecord,
  LandingRoom,
  PublicationStatus,
  Readiness,
  ReserveResult,
} from "./landing/types.ts";
export { Workspaces, forkName, MIN_TOKEN_TTL_S } from "./workspace/workspaces.ts";
export type { WorkspacesOptions } from "./workspace/workspaces.ts";
export { ForkTokens } from "./workspace/fork-tokens.ts";
export type { ForkRepo, ForkToken, ForkTokenDuties, ForkTokenDuty, ForkTokenState, ForkTokensOptions, ForkWatch } from "./workspace/fork-tokens.ts";
export { MAX_RETAIN_MS, PREPARE_WINDOW_MS, SnapshotRepos } from "./snapshot/repos.ts";
export type { SnapshotRepo, SnapshotReposOptions, SnapshotToken, SnapshotWriter } from "./snapshot/repos.ts";
export {
  DEFAULT_BOUNDS,
  EMPTY_TREE,
  TreeCache,
  changedPaths,
  mergeBases,
  overlappingPaths,
  previewPlan,
  touchedPaths,
  treeDiff,
} from "./diff/treediff.ts";
export type { DiffBounds, DiffResult, DiffStats, TreeEntry, TreeReader } from "./diff/treediff.ts";
export { ContainerPublisher, Pinning } from "./publisher/client.ts";
export type { LogRemoteStub, PinningOptions, PublisherClientOptions, PublisherStub } from "./publisher/client.ts";
export { GitOps, HARDENING, LOG_REF, SNAPSHOT_AUTHOR, SNAPSHOT_REF, integrationMessage, integrationRef, objectsRef, pinnedRef } from "./publisher/gitops.ts";
export { decodeLogPush, decodeLogStage, fromB64url, toB64url, toLogOutcome, LOG_PUSH_LIMITS } from "./publisher/log-push.ts";
export type { LogPushOutcome, LogPushRequest, LogStageRequest } from "./publisher/log-push.ts";
export type { Exec, ExecResult, BuildResult, LogObject, PinResult, PreviewResult, SnapshotFile, StageChunk, StageResult, StageWant } from "./publisher/gitops.ts";
export { GitPublisher, landMessage } from "./publisher/git-publisher.ts";
export { ARTIFACTS_REFUSALS, artifactsRefusal, classifyGitPush, definitelyNotApplied } from "./publisher/push-outcome.ts";
export type { PushOutcome } from "./publisher/push-outcome.ts";
export { checkUpdates, readCommands, FenceError } from "./publisher/ref-fence.ts";
export { completeInventory, readMainVia, withRetry } from "./artifacts.ts";
export {
  MINT_CLOCK_ALLOWANCE_MS,
  MINT_LISTING_MAX,
  MINT_RETRY,
  MINT_REVOKE_BACKOFF,
  MINT_REVOKE_BATCH,
  MINT_WAIT_MS,
  MintLedger,
  OBSERVE_WAIT,
  OVERDUE_STEP_MS,
  TAKEOVER_AHEAD_MS,
  TAKEOVER_MOVE_MS,
  errorNote,
  within,
  knownArtifactsCode,
} from "./mints.ts";
export type { ErrorStage, LedgerToken, MintDuties, MintDuty, MintLedgerOptions, MintRepo, MintScope, MintState } from "./mints.ts";
export { EMPTY_TREE_SHA, FIRST_COMMIT_IDENTITY, FIRST_COMMIT_MESSAGE, firstCommit, pushFirstCommit } from "./first-commit.ts";
export type { FirstCommitOutcome, LooseObject } from "./first-commit.ts";
export type { ArtifactsNamespace, CreatedRepo, RepoHandle } from "./artifacts.ts";
export { SCRUB_BATCH, SCRUB_TABLES, WITHHELD, isSafeErrorText, safeErrorText, scrubBatch, scrubLegacyErrors } from "./safe-errors.ts";
export type { ScrubCursor, ScrubTable } from "./safe-errors.ts";
export { durableSql } from "./sql.ts";
export type { Sql, SqlRow, SqlValue } from "./sql.ts";
