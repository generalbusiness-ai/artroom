/**
 * @generalbusiness/artroom-git
 *
 * Artroom's git engine (plan sections 6 and 8, lane B):
 * - lane forks and fork-scoped, lease-bound tokens (`Workspaces`);
 * - pinned heads and merge previews in the publisher sandbox (`Pinning`);
 * - bounded, hash-cached path diffs through the Artifacts binding
 *   (`changedPaths`, `previewPlan`);
 * - the durable landing operation (`Landing`).
 *
 * The Durable Object and container classes are in `./worker`
 * (`Publisher`, `ArtifactsGateway`), because they need the Workers runtime.
 */

export { Landing, EngineStopped } from "./landing/engine.ts";
export type { FaultPoint, LandingOptions, PublicationTokens, PublisherPort } from "./landing/engine.ts";
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
export type { LogPushStub, PublisherClientOptions, PublisherStub } from "./publisher/client.ts";
export { GitOps, HARDENING, LOG_REF, integrationMessage, integrationRef, objectsRef, pinnedRef } from "./publisher/gitops.ts";
export { decodeLogPush, fromB64url, toB64url, toLogOutcome, LOG_PUSH_LIMITS } from "./publisher/log-push.ts";
export type { LogPushOutcome, LogPushRequest } from "./publisher/log-push.ts";
export type { Exec, ExecResult, BuildResult, PinResult, PreviewResult } from "./publisher/gitops.ts";
export { GitPublisher, landMessage } from "./publisher/git-publisher.ts";
export { classifyGitPush, definitelyNotApplied } from "./publisher/push-outcome.ts";
export type { PushOutcome } from "./publisher/push-outcome.ts";
export { checkUpdates, readCommands, FenceError } from "./publisher/ref-fence.ts";
export { canonicalTokens, readMainVia, withRetry } from "./artifacts.ts";
export type { ArtifactsNamespace, RepoHandle } from "./artifacts.ts";
export { durableSql } from "./sql.ts";
export type { Sql, SqlRow, SqlValue } from "./sql.ts";
