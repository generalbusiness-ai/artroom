/**
 * @generalbusiness/artroom-git
 *
 * Everything of Artroom that touches a Git repository or a Git host (I3
 * plan, section 3.1). It runs outside a scope's commit. The review that each retained part passed is
 * `notes/2026-10-05-i3-git-review.md`.
 *
 * `./node` has the one module that needs Node: `nodeExec`.
 * `./http`, `./http-read` and `./github` use Web APIs and also run in Workers.
 */

export { GitRefusal, MAX_REF_NAME, ZERO_ID, branchRef, isObjectId, objectId, refName, remoteUrl } from "./names.ts";
export type { GitReason, ObjectId, Transport } from "./names.ts";
export { MODES, READ_BOUNDS, Reader, idOf, parseCommit, parseTree } from "./reader.ts";
export type { Closure, Commit, GitSource, Mode, ObjectType, ReadBounds, RefTarget, StoredObject, TreeEntry } from "./reader.ts";
export { COMMAND_MS, GitFailure, GitProgram, HARDENING, repositorySource } from "./program.ts";
export type { Exec, ExecResult, ProgramOptions } from "./program.ts";
export { Git, SEND_OBJECTS } from "./gitops.ts";
export type { GitOptions, Publication, RefUpdate, SendRequest } from "./gitops.ts";
export { attemptOutcome, classifySend, readAnswer } from "./push-outcome.ts";
export type { AttemptOutcome, Forwarding, PushAnswer, ReadBack, Reported, SendEvidence } from "./push-outcome.ts";
export { Gateway, GatewayRefusal, MAX_COMMAND_BYTES, readCommands } from "./gateway.ts";
export type { GatewayOptions, GatewayReason, GrantRecord, GrantRecords, GrantRequest, GrantedUpdate } from "./gateway.ts";
export { READ_TOKEN_OWNER, TOKEN_KINDS, TOKEN_OWNER, TokenDriver } from "./host.ts";
export type { AttemptOf, Custody, GitHost, LiveToken, MintAsk, MintReply, RevokeAsk, RevokeReply, TokenAnswer, TokenDriverOptions, TokenFor, TokenRequest } from "./host.ts";
export { FILE_MODES, SNAPSHOT_BOUNDS, SNAPSHOT_IDENTITY, snapshotCommit, snapshotFiles } from "./snapshot.ts";
export type { BuiltObject, FileMode, SnapshotBounds, SnapshotCommit, SnapshotFile } from "./snapshot.ts";
