/**
 * @generalbusiness/artroom-contract
 *
 * Artroom's shared contract: identifiers, the signed envelope, the seven acts
 * and their records, lanes and leases, obligations and evidence, landing
 * operations, the roster, the log format, policy, checkers and the
 * per-transport surfaces, and declared acts (R-DECL). Types only, plus type
 * guards and one frozen datum: the legacy vocabulary and its digest.
 *
 * The normative rules are in docs/protocol.md. Policy authoring helpers are
 * exported from `@generalbusiness/artroom-contract/policy`.
 */

export type * from "./ids.ts";
export type * from "./errors.ts";
export type * from "./roster.ts";
export type * from "./lanes.ts";
export type * from "./acts.ts";
export type * from "./envelope.ts";
export type * from "./evidence.ts";
export type * from "./landing.ts";
export type * from "./log.ts";
export type * from "./pagination.ts";
export type * from "./checker.ts";
export type * from "./declarations.ts";
export type {
  BudgetState,
  CarryFactsRecord,
  NotifyDirectory,
  PathOwners,
  ReplayContext,
  RetainedLandInput,
  Usage,
  CarryRule,
  CarrySettings,
  CheckerConfig,
  Decision,
  Expr,
  LandRule,
  LaneMode,
  NotifyRule,
  NotifyTarget,
  PolicyActor,
  PolicyDocument,
  PolicyLane,
  PolicyPart,
  PolicyProfile,
  PolicyProposal,
  PolicyRoom,
  ProfileStamp,
  RefuseRule,
  RequireRule,
  Rule,
  RuleInput,
  RuleKind,
} from "./policy.ts";
export type {
  ActOptions,
  ArtroomFounder,
  ActsNotFound,
  AnyBearerAct,
  ArtroomService,
  BearerAct,
  BearerRequest,
  ByteStream,
  CatalogueAt,
  DraftedRoom,
  ExplainNotFound,
  GenericActOptions,
  Founding,
  InvitationLink,
  RepoSource,
  RoomDraft,
  RoomRef,
  WsProtocol,
  WsTokenProtocol,
  Credentials,
  Explanation,
  HttpRoom,
  HttpRoutes,
  Joined,
  JsonSchema,
  McpHeld,
  McpInput,
  McpMaxWaitMs,
  McpNotFound,
  McpOutput,
  McpToolAnnotations,
  McpToolDescriptor,
  McpToolName,
  McpTools,
  McpToolset,
  McpToolsets,
  ReadQuery,
  ReadResults,
  Redeemed,
  Redemption,
  Room,
  RoomApi,
  RoomWire,
  Session,
  SessionToken,
  Signer,
  Subscription,
  UpdateStream,
} from "./transports.ts";
export {
  envelopeOf,
  holdsSlot,
  isActId,
  isArtroomError,
  isCarried,
  isCursor,
  isDigest,
  isHeld,
  isKeyId,
  isMemberId,
  isRefusal,
  isRoomId,
  isSha,
  isTerminal,
} from "./guards.ts";
export { ARTROOM_LEGACY_V1, ARTROOM_LEGACY_V1_DIGEST, type LegacyVocabulary } from "./legacy.ts";
