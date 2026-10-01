/**
 * @generalbusiness/artroom-log
 *
 * Publication of the Room's log to `refs/artroom/log` (R-LOG-8, R-LOG-9,
 * R-LOG-11) and offline verification (R-LOG-10). Runtime-neutral: the git
 * CLI adapter is in `./git-cli` (Node only).
 */

export { CanonicalError, canonicalBytes, canonicalize, parseStrict } from "./canonical.ts";
export { b64url, digestJson, keyIdOf, keyPairFromSeed, publicKeyOf, sign, verifySig, type KeyPair } from "./crypto.ts";
export { Malformed, decodeCheckpoint, decodeEntry, decodeRetained } from "./decode.ts";
export { LOG_REF, contentOf, entryId, logFiles, makeCheckpoint, retain, retainedPath, roomIdOf, seal, segmentPath, type Retained } from "./entries.ts";
export {
  MemoryGit,
  buildTree,
  encodeCommit,
  encodeTree,
  gitObject,
  parseCommit,
  parseTree,
  type GitObject,
  type GitReader,
  type GitRemote,
  type ObjectType,
  type PushOutcome,
  type TreeEntry,
} from "./git.ts";
export {
  LOG_TRANSFER_LIMITS,
  LogPublisher,
  PublishError,
  publicationDue,
  readLogFiles,
  readPublishedEntries,
  type BatchPolicy,
  type PublishErrorCode,
  type PublishResult,
  type PublisherOptions,
} from "./publisher.ts";
export { RosterReplay, delegableBy, roleMaySign, type AuthorityFailure, type Judgement } from "./roster.ts";
export { verifyLog, type VerifyFailure, type VerifyOptions, type VerifyReason, type VerifyReport } from "./verify.ts";
