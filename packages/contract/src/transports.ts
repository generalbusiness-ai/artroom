/**
 * One vocabulary, every transport (plan section 5, principle 1). Rules R-API
 * and R-CRED in docs/protocol.md.
 *
 * - `RoomApi`: the methods every typed handle has.
 * - `Room`: the handle over a Workers service binding (RPC). Disposable.
 * - `HttpRoom`: the handle over HTTPS, for browsers, the CLI and scripts.
 * - `McpTools`: the ten MCP tools, mapped one to one to `RoomApi` methods.
 * - `ArtroomService`, `RoomWire`, `HttpRoutes`: the wire beneath the handles.
 */

import type {
  ActId,
  Base64Url,
  Brand,
  Cursor,
  DelegationId,
  Generation,
  Glob,
  IdempotencyKey,
  InvitationId,
  KeyId,
  LaneId,
  LeaseGeneration,
  MemberId,
  OpId,
  Reason,
  RoomId,
  RoomName,
  Seq,
  Sha,
  Timestamp,
} from "./ids.ts";
import type {
  ActRecord,
  Check,
  CheckActInput,
  Claim,
  ClaimInput,
  EnvelopeKind,
  Landing,
  Note,
  NoteAnchor,
  NoteInput,
  Proposal,
  ProposalAt,
  ProposalRef,
  ProposeInput,
  Release,
  ReleaseInput,
  Renewal,
  Review,
  ReviewInput,
  RosterRecord,
} from "./acts.ts";
import type { Held, Lane, LaneFilter } from "./lanes.ts";
import type { OpByKind, OpKind, OpRef, OpState, Reached, WaitOptions, WorkspaceGrant, WorkspaceOp } from "./landing.ts";
import type { AttentionItem, LogPage, LogRequest, Page, PageRequest, Update } from "./pagination.ts";
import type { Role, Roster, RosterOp } from "./roster.ts";
import type { Result } from "./errors.ts";
import type { JoinEnvelope, SignedEnvelope, SignedRequest } from "./envelope.ts";
import type { Decision } from "./policy.ts";
import type { Evidence, NotCarried } from "./evidence.ts";
import type { LogEntry } from "./log.ts";

// -------------------------------------------------------------- credentials

/** Signs envelope bytes with an Ed25519 key. WebCrypto, a key file or a Worker secret. */
export interface Signer {
  readonly key: KeyId;
  sign(bytes: Uint8Array): Promise<Uint8Array>;
}

/** How a caller proves who it is (plan section 5, "Transports and credentials"; R-CRED). */
export type Credentials =
  /** Browser (WebCrypto key) or CLI (key file): the client signs each envelope. */
  | { readonly kind: "key"; readonly signer: Signer }
  /** Worker over a service binding: the calling Worker signs; `as` only chooses among its delegations. */
  | { readonly kind: "delegation"; readonly signer: Signer; readonly as: DelegationId }
  /** MCP agent: a bearer token from an invitation; the room signs under the token's delegation. */
  | { readonly kind: "bearer"; readonly token: string };

/** A read session, from a signed `session` request or a bearer token. Never recorded. */
export type SessionToken = Brand<string, "SessionToken">;

export interface Session {
  readonly token: SessionToken;
  readonly member: MemberId;
  readonly expiresAt: Timestamp;
}

// --------------------------------------------------------------- onboarding

/**
 * Redeeming an invitation (R-GEN-6, R-CRED-9). The only call that needs no
 * prior credential: the invitation secret is the credential.
 * - `client`: the caller already made its key and signs a `join` with it.
 * - `room`: the room makes and keeps the member's key, and returns a bearer
 *   token for MCP (R-CRED-3).
 */
export type Redemption =
  | { readonly custody: "client"; readonly join: SignedEnvelope<JoinEnvelope> }
  | { readonly custody: "room"; readonly invitation: InvitationId; readonly secret: Base64Url };

/** The result of a client-custody redemption. */
export interface Joined {
  readonly custody: "client";
  readonly member: MemberId;
  readonly role: Role;
  readonly key: KeyId;
  readonly record: RosterRecord;
  readonly session: Session;
}

/** The result of a room-custody redemption. The bearer token is shown once and never recorded. */
export interface Redeemed {
  readonly custody: "room";
  readonly member: MemberId;
  readonly role: Role;
  /** The room-held member key. */
  readonly key: KeyId;
  /** The delegation the bearer session acts under; its ID is the `delegate` act's. */
  readonly delegation: DelegationId;
  readonly bearer: string;
  readonly expiresAt: Timestamp;
  /** The MCP endpoint to give the agent. */
  readonly mcp: `https://${string}`;
}

/** Options every act method accepts. */
export interface ActOptions {
  /** Reuse it to retry safely after a timeout (R-IDEM). Default: a fresh random key per call. */
  readonly idempotencyKey?: IdempotencyKey;
}

// ------------------------------------------------------------------- reads

/** What `explain` returns: the rules applied, their inputs and outcomes (plan section 5). */
export interface Explanation {
  readonly act: ActId;
  readonly kind: EnvelopeKind | "system";
  readonly outcome: "accepted" | "refused" | "system";
  readonly entry: LogEntry;
  readonly decisions: readonly Decision[];
  /** Platform invariants checked, by rule number in docs/protocol.md, e.g. `R-PROP-4`. */
  readonly invariants: readonly { readonly rule: `R-${string}`; readonly held: boolean; readonly detail?: string }[];
  /** For proposals: each obligation's evidence, and what did not carry. */
  readonly evidence?: readonly { readonly obligation: string; readonly evidence: readonly Evidence[]; readonly notCarried: readonly NotCarried[] }[];
  /** True when the entry is at or below `publishedThrough`, so `artroom verify` can check it offline. */
  readonly published: boolean;
}

// ---------------------------------------------------------------- the handle

/** The methods every typed handle has, on every transport. */
export interface RoomApi {
  readonly id: RoomId;
  readonly name: RoomName;

  // The seven acts, and renew and roster. Lane-changing acts take a `Held`.
  claim(input: ClaimInput, opts?: ActOptions): Promise<Result<Claim>>;
  propose(held: Held, input: ProposeInput, opts?: ActOptions): Promise<Result<Proposal>>;
  note(anchor: NoteAnchor, input: NoteInput, opts?: ActOptions): Promise<Result<Note>>;
  review(proposal: ProposalAt, input: ReviewInput, opts?: ActOptions): Promise<Result<Review>>;
  check(proposal: ProposalRef, input: CheckActInput, opts?: ActOptions): Promise<Result<Check>>;
  land(held: Held, proposal: ProposalAt, opts?: ActOptions): Promise<Result<Landing>>;
  release(held: Held, input?: ReleaseInput, opts?: ActOptions): Promise<Result<Release>>;
  renew(held: Held, opts?: ActOptions): Promise<Result<Renewal>>;
  roster(op: RosterOp, opts?: ActOptions): Promise<Result<RosterRecord>>;

  /** Opens (or returns) the lane's workspace operation: pending → ready | failed. Holder only. No token (R-WS-1). */
  workspace(held: Held): Promise<Result<WorkspaceOp>>;
  /** The fork's write token. Current holder and lease only, judged at each call (R-WS-2). */
  workspaceToken(held: Held): Promise<Result<WorkspaceGrant>>;

  // Reads.
  lane(id: LaneId): Promise<Lane | null>;
  lanes(filter?: LaneFilter & PageRequest): Promise<Page<Lane>>;
  proposal(ref: ProposalRef): Promise<Proposal | null>;
  op<K extends OpKind>(ref: OpRef<K>): Promise<OpByKind[K]>;
  /** Resolves when the operation reaches one of `until`. Throws `timeout` otherwise. */
  wait<K extends OpKind, const S extends OpState<K>>(op: OpRef<K>, opts: WaitOptions<S>): Promise<Reached<K, S>>;
  attention(page?: PageRequest): Promise<Page<AttentionItem>>;
  log(req?: LogRequest): Promise<LogPage>;
  explain(act: ActId): Promise<Explanation | null>;
  members(): Promise<Roster>;
}

/**
 * A structural subset of the Streams API `ReadableStream<Update>`, so this
 * package needs no DOM or Workers lib. A real stream satisfies it.
 */
export interface UpdateStream {
  getReader(): {
    read(): Promise<{ readonly done: false; readonly value: Update } | { readonly done: true; readonly value?: undefined }>;
    releaseLock(): void;
  };
  cancel(reason?: unknown): Promise<void>;
}

/** The handle over a Workers service binding. `using` releases the client stub only. */
export interface Room extends RoomApi, Disposable {
  /** A stream of updates from `cursor` (the start of the live tail when absent). */
  subscribe(cursor?: Cursor): Promise<UpdateStream>;
}

/** A live WebSocket subscription in the browser. */
export interface Subscription extends Disposable {
  readonly cursor: Cursor;
  close(): void;
}

/** The handle over HTTPS. */
export interface HttpRoom extends RoomApi, Disposable {
  /** Long poll: resolves with the next update after `cursor`, or an empty one after `waitMs`. */
  subscribe(cursor?: Cursor, opts?: { readonly waitMs?: number }): Promise<Update>;
  /** Browser only: a hibernating WebSocket that calls `onUpdate` for each update. */
  watch(cursor: Cursor | undefined, onUpdate: (update: Update) => void): Subscription;
}

// --------------------------------------------------------------- the wire

/** The read queries beneath the handle's read methods. */
export type ReadQuery =
  | { readonly q: "lane"; readonly lane: LaneId }
  | { readonly q: "lanes"; readonly filter?: LaneFilter & PageRequest }
  | { readonly q: "proposal"; readonly ref: ProposalRef }
  | { readonly q: "op"; readonly op: OpId; readonly until?: readonly string[]; readonly timeoutMs?: number }
  | { readonly q: "attention"; readonly page?: PageRequest }
  | { readonly q: "log"; readonly req?: LogRequest }
  | { readonly q: "explain"; readonly act: ActId }
  | { readonly q: "members" };

export interface ReadResults {
  readonly lane: Lane | null;
  readonly lanes: Page<Lane>;
  readonly proposal: Proposal | null;
  readonly op: OpByKind[OpKind];
  readonly attention: Page<AttentionItem>;
  readonly log: LogPage;
  readonly explain: Explanation | null;
  readonly members: Roster;
}

/** The per-room RPC target beneath `Room`. Every method is stateless on the server. */
export interface RoomWire extends Disposable {
  submit(act: SignedEnvelope): Promise<Result<ActRecord>>;
  /** `workspace` returns `WorkspaceOp`; `workspace-token` returns `WorkspaceGrant`; `session` returns `Session`. */
  request(req: SignedRequest): Promise<Result<WorkspaceOp | WorkspaceGrant | Session>>;
  /** Redeem an invitation. Needs no session (R-CRED-9). */
  redeem(redemption: Redemption): Promise<Result<Joined | Redeemed>>;
  read<Q extends ReadQuery>(session: SessionToken, query: Q): Promise<ReadResults[Q["q"]]>;
  subscribe(session: SessionToken, cursor?: Cursor): Promise<UpdateStream>;
}

/** The Workers service binding, `env.ARTROOM`. */
export interface ArtroomService {
  room(room: RoomName | RoomId): Promise<RoomWire>;
}

/** HTTPS routes (R-API-3). `ok` is the 200 body; refusals are 409 with a `Refusal` body. */
export interface HttpRoutes {
  "POST /v1/rooms/:room/acts": { readonly body: SignedEnvelope; readonly ok: ActRecord };
  /** Responses carrying a `WorkspaceGrant` are sent with `Cache-Control: no-store` (R-WS-4). */
  "POST /v1/rooms/:room/requests": { readonly body: SignedRequest; readonly ok: WorkspaceOp | WorkspaceGrant | Session };
  /** No `Authorization` header; rate-limited per address and invitation (R-CRED-9). */
  "POST /v1/rooms/:room/redeem": { readonly body: Redemption; readonly ok: Joined | Redeemed };
  "GET /v1/rooms/:room/lanes": { readonly query: LaneFilter & PageRequest; readonly ok: Page<Lane> };
  "GET /v1/rooms/:room/lanes/:lane": { readonly ok: Lane };
  "GET /v1/rooms/:room/lanes/:lane/:generation": { readonly ok: Proposal };
  "GET /v1/rooms/:room/ops/:op": { readonly query: { readonly until?: string; readonly timeoutMs?: number }; readonly ok: OpByKind[OpKind] };
  "GET /v1/rooms/:room/attention": { readonly query: PageRequest; readonly ok: Page<AttentionItem> };
  "GET /v1/rooms/:room/log": { readonly query: LogRequest; readonly ok: LogPage };
  "GET /v1/rooms/:room/explain/:act": { readonly ok: Explanation };
  "GET /v1/rooms/:room/members": { readonly ok: Roster };
  "GET /v1/rooms/:room/subscribe": { readonly query: { readonly cursor?: Cursor; readonly waitMs?: number }; readonly ok: Update };
  "GET /v1/rooms/:room/ws": { readonly upgrade: "websocket"; readonly message: Update };
  "POST /v1/rooms/:room/mcp": { readonly mcp: "streamable-http" };
}

/** Connect to a room. Declared here; implemented by the client package. */
export declare function connect(
  service: ArtroomService,
  room: RoomName | RoomId,
  credentials: Extract<Credentials, { kind: "key" | "delegation" }>,
): Promise<Room>;
export declare function connect(
  endpoint: { readonly url: `https://${string}` },
  room: RoomName | RoomId,
  credentials: Credentials,
): Promise<HttpRoom>;

/** Redeem a client-custody invitation with a key the caller made. Declared here; implemented by the client package. */
export declare function join(
  endpoint: ArtroomService | { readonly url: `https://${string}` },
  room: RoomId,
  invitation: { readonly invitation: InvitationId; readonly secret: Base64Url; readonly signer: Signer },
): Promise<Result<Joined>>;

/** Redeem a room-custody invitation for an MCP bearer token. Declared here; implemented by the client package. */
export declare function redeem(
  endpoint: { readonly url: `https://${string}` },
  room: RoomId,
  invitation: { readonly invitation: InvitationId; readonly secret: Base64Url },
): Promise<Result<Redeemed>>;

// --------------------------------------------------------------------- MCP

/** The lane and lease generation an MCP agent holds: `Held`, flattened for JSON. */
export interface McpHeld {
  readonly lane: LaneId;
  readonly lease: LeaseGeneration;
}

interface McpCommon {
  readonly idempotencyKey?: IdempotencyKey;
}

/**
 * The ten MCP tools. Each maps to the `RoomApi` method of the same name; the
 * MCP server rebuilds `Held` from `McpHeld` using the room's current lease
 * expiry, and fences on `lease` exactly as the method does (R-API-9).
 */
export interface McpTools {
  readonly claim: {
    readonly input: McpCommon &
      (
        | { readonly goal: string; readonly scope: readonly Glob[]; readonly plan?: string; readonly because?: readonly Reason[] }
        | {
            readonly lane: LaneId;
            readonly lease?: LeaseGeneration;
            readonly expectedGeneration: Generation;
            readonly scope: readonly Glob[];
            readonly goal?: string;
            readonly plan?: string;
          }
      );
    readonly output: Result<Claim>;
  };
  /**
   * Waits up to `waitMs` (default 20 000) for ready or failed. `grant` is
   * present only when ready, and only for the current holder and lease (R-WS-2).
   */
  readonly workspace: {
    readonly input: McpHeld & { readonly waitMs?: number };
    readonly output: Result<{ readonly op: WorkspaceOp; readonly grant: WorkspaceGrant | null }>;
  };
  readonly renew: { readonly input: McpHeld & McpCommon; readonly output: Result<Renewal> };
  readonly release: { readonly input: McpHeld & McpCommon & { readonly note?: string }; readonly output: Result<Release> };
  readonly propose: {
    readonly input: McpHeld & McpCommon & { readonly head: Sha; readonly expectedGeneration: Generation; readonly summary: string };
    readonly output: Result<Proposal>;
  };
  readonly note: {
    readonly input: McpCommon & { readonly anchor: NoteAnchor; readonly text: string; readonly replyTo?: ActId };
    readonly output: Result<Note>;
  };
  readonly review: {
    readonly input: McpCommon &
      ProposalAt & {
        readonly verdict: "approve" | "object";
        readonly scope: readonly Glob[];
        readonly dependsOn?: readonly Glob[];
        readonly text: string;
      };
    readonly output: Result<Review>;
  };
  /** Waits up to `waitMs` (default 0) for a terminal or slot-holding state. */
  readonly land: {
    readonly input: McpHeld & McpCommon & { readonly generation: Generation; readonly head: Sha; readonly waitMs?: number };
    readonly output: Result<Landing>;
  };
  /** Also the MCP form of `subscribe`: call again with the returned cursor. */
  readonly attention: { readonly input: PageRequest; readonly output: Page<AttentionItem> & { readonly publishedThrough: Seq } };
  readonly explain: { readonly input: { readonly act: ActId }; readonly output: Explanation | null };
}

export type McpToolName = keyof McpTools;
export type McpInput<T extends McpToolName> = McpTools[T]["input"];
export type McpOutput<T extends McpToolName> = McpTools[T]["output"];

/** A JSON Schema subset, enough to describe the tools. */
export interface JsonSchema {
  readonly type?: "object" | "array" | "string" | "integer" | "boolean" | "null";
  readonly description?: string;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly items?: JsonSchema;
  readonly enum?: readonly (string | number)[];
  readonly oneOf?: readonly JsonSchema[];
  readonly pattern?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly additionalProperties?: boolean;
}

/** The descriptor the MCP server publishes per tool. Lane E writes these and tests them against `McpTools`. */
export interface McpToolDescriptor<T extends McpToolName = McpToolName> {
  readonly name: T;
  readonly description: string;
  readonly inputSchema: JsonSchema & { readonly type: "object" };
  readonly outputSchema: JsonSchema;
  /** The `RoomApi` method this tool calls. */
  readonly method: T;
}
