/**
 * One vocabulary, every transport (plan section 5, principle 1). Rules R-API
 * and R-CRED in docs/protocol.md.
 *
 * - `RoomApi`: the methods every typed handle has.
 * - `Room`: the handle over a Workers service binding (RPC). Disposable.
 * - `HttpRoom`: the handle over HTTPS, for browsers, the CLI and scripts.
 * - `McpTools`: the ten MCP tools, mapped one to one to `RoomApi` methods.
 * - `ArtroomService`, `RoomWire`, `HttpRoutes`: the wire beneath the handles.
 * - `ArtroomFounder`, `RoomDraft`, `Founding`, `RoomRef`: founding a room and
 *   finding its ID from its name (R-GEN-10, R-GEN-11, R-API-11).
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
import type { AttentionPage, LogPage, LogRequest, Page, PageRequest, Update } from "./pagination.ts";
import type { Genesis, Role, Roster, RosterOp, SignedOnboardingGrant } from "./roster.ts";
import type { Result } from "./errors.ts";
import type { Envelope, JoinEnvelope, RequestBody, SignedEnvelope, SignedRequest } from "./envelope.ts";
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
 *
 * `custody` only chooses the code path. It is not proof: the shared join
 * admission compares the invitation's recorded custody with that path
 * (R-ADM-12), so either branch refuses the other custody.
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

/**
 * An invitation link (R-CRED-11). The room ID is in the path; the invitation
 * ID and the secret are only in the fragment, which is never sent in an HTTP
 * request. The API endpoint is the link's origin and any path before `/rooms/`.
 */
export type InvitationLink = `https://${string}/rooms/${RoomId}/join#i=${InvitationId}&s=${string}`;

// ----------------------------------------------------------------- founding

/**
 * Where a new room's canonical repository comes from (R-GEN-12).
 * - `new`: public founding. The deployment allocates a fresh, empty,
 *   isolated repository. The caller cannot name one.
 * - `import`: an existing repository, with an operator's grant for it and
 *   for the first admin key.
 */
export type RepoSource = { readonly kind: "new" } | { readonly kind: "import"; readonly grant: SignedOnboardingGrant };

/** Founding, step 1: what the first admin asks the deployment for (R-GEN-10). */
export interface RoomDraft {
  /** 1 to 128 characters, never in the form of a room ID (R-GEN-11). */
  readonly name: RoomName;
  readonly repo: RepoSource;
  readonly admin: { readonly handle: MemberId; readonly key: KeyId };
  readonly recovery: KeyId;
}

/** The genesis object to sign, with a room key the deployment made, and the draft value that names that key. */
export interface DraftedRoom {
  readonly genesis: Genesis;
  /** Not a secret. The deployment recovers the room key, and for `new` the repository identity, from it at `found`. */
  readonly draft: string;
}

/**
 * Founding, step 2: the genesis, signed by the first admin key (R-GEN-1,
 * R-SIG-1), and the draft value. An import's grant travels inside the
 * genesis (`Genesis.onboarding`), so the signature covers it.
 */
export interface Founding {
  readonly genesis: Genesis;
  readonly sig: Base64Url;
  readonly draft: string;
}

/** A room's ID and its name (R-API-11). */
export interface RoomRef {
  readonly room: RoomId;
  readonly name: RoomName;
}

/** Founding over a service binding: methods on the Worker's entrypoint, beside `ArtroomService` (R-GEN-10). */
export interface ArtroomFounder {
  draft(input: RoomDraft): Promise<DraftedRoom>;
  /** Returns the new room's ID. Repeating it with the same genesis returns the same ID. */
  found(genesis: Genesis, sig: Base64Url, draft: string): Promise<RoomId>;
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
  /** The attention queue, with `publishedThrough` (R-API-9). */
  attention(page?: PageRequest): Promise<AttentionPage>;
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

/**
 * A structural subset of the Streams API `ReadableStream<Uint8Array>`, so
 * this package needs no DOM or Workers lib. Workers RPC streams carry bytes.
 */
export interface ByteStream {
  getReader(): {
    read(): Promise<{ readonly done: false; readonly value: Uint8Array } | { readonly done: true; readonly value?: undefined }>;
    releaseLock(): void;
  };
  cancel(reason?: unknown): Promise<void>;
}

/** The handle over a Workers service binding. `using` releases the client stub only. */
export interface Room extends RoomApi, Disposable {
  /**
   * A stream of updates from `cursor` (the start of the live tail when
   * absent). The handle decodes `RoomWire.subscribe`'s bytes (R-API-8).
   */
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
  /**
   * A hibernating WebSocket that calls `onUpdate` for each update. The read
   * token travels as a subprotocol, never in the URL (R-API-12).
   */
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
  readonly attention: AttentionPage;
  readonly log: LogPage;
  readonly explain: Explanation | null;
  readonly members: Roster;
}

type Unsigned<E> = E extends Envelope ? Pick<E, "kind" | "target" | "body" | "idempotencyKey"> : never;

/**
 * An act for the room to sign under a bearer session (R-CRED-3, R-CRED-10):
 * an envelope without `v`, `room`, `actor` and `delegation`, which the room
 * sets. Never `roster`: a delegation cannot grant it (R-ADM-5).
 */
export type BearerAct = Unsigned<Exclude<Envelope, { readonly kind: "roster" }>>;

/** The unrecorded requests a bearer session may make: the workspace and its token (R-CRED-10). */
export type BearerRequest = Exclude<RequestBody, { readonly kind: "session" }>;

/** The per-room RPC target beneath `Room`. Every method is stateless on the server. */
export interface RoomWire extends Disposable {
  /** Admitted with path `submitted`: a `join` here can redeem only a client-custody invitation (R-ADM-12). */
  submit(act: SignedEnvelope): Promise<Result<ActRecord>>;
  /** `workspace` returns `WorkspaceOp`; `workspace-token` returns `WorkspaceGrant`; `session` returns `Session`. */
  request(req: SignedRequest): Promise<Result<WorkspaceOp | WorkspaceGrant | Session>>;
  /** Redeem an invitation. Needs no session (R-CRED-9). */
  redeem(redemption: Redemption): Promise<Result<Joined | Redeemed>>;
  /**
   * An act for an MCP agent, signed by the room with the bearer's session key
   * under its delegation, on the `submitted` path (R-CRED-3 step 4, R-CRED-10).
   * An unknown, expired or revoked bearer throws `unauthenticated`.
   */
  bearerAct(bearer: string, act: BearerAct): Promise<Result<ActRecord>>;
  /** `workspace` or `workspace-token` for a bearer session, judged as R-CRED-5 and R-WS-2 judge a signed request (R-CRED-10). */
  bearerRequest(bearer: string, req: BearerRequest): Promise<Result<WorkspaceOp | WorkspaceGrant>>;
  /** `session` is a session token or a bearer token (R-API-3). */
  read<Q extends ReadQuery>(session: SessionToken, query: Q): Promise<ReadResults[Q["q"]]>;
  /** Newline-delimited JSON `Update`s, as UTF-8 bytes (R-API-8). `session` is a session or bearer token. */
  subscribe(session: SessionToken, cursor?: Cursor): Promise<ByteStream>;
}

/** The Workers service binding, `env.ARTROOM`. */
export interface ArtroomService {
  /** By ID, or by name (R-GEN-11). A Worker that signs acts needs the ID, because envelopes carry it (R-ID-3). */
  room(room: RoomName | RoomId): Promise<RoomWire>;
}

/** HTTPS routes (R-API-3). `ok` is the 200 body; refusals are 409 with a `Refusal` body. */
export interface HttpRoutes {
  /** Founding, step 1. No credential (R-GEN-10). */
  "POST /v1/rooms": { readonly body: RoomDraft; readonly ok: DraftedRoom };
  /** Founding, step 2. No credential; the signed genesis is the proof (R-GEN-10). */
  "POST /v1/rooms/found": { readonly body: Founding; readonly ok: { readonly room: RoomId } };
  /** `:room` is a name or an ID. No credential (R-API-11). */
  "GET /v1/rooms/:room": { readonly ok: RoomRef };
  /** Path `submitted`: a `join` here can redeem only a client-custody invitation (R-ADM-12). */
  "POST /v1/rooms/:room/acts": { readonly body: SignedEnvelope; readonly ok: ActRecord };
  /** Responses carrying a `WorkspaceGrant` are sent with `Cache-Control: no-store` (R-WS-4). */
  "POST /v1/rooms/:room/requests": { readonly body: SignedRequest; readonly ok: WorkspaceOp | WorkspaceGrant | Session };
  /** No `Authorization` header; rate-limited per address and invitation (R-CRED-9). */
  "POST /v1/rooms/:room/redeem": { readonly body: Redemption; readonly ok: Joined | Redeemed };
  "GET /v1/rooms/:room/lanes": { readonly query: LaneFilter & PageRequest; readonly ok: Page<Lane> };
  "GET /v1/rooms/:room/lanes/:lane": { readonly ok: Lane };
  "GET /v1/rooms/:room/lanes/:lane/:generation": { readonly ok: Proposal };
  "GET /v1/rooms/:room/ops/:op": { readonly query: { readonly until?: string; readonly timeoutMs?: number }; readonly ok: OpByKind[OpKind] };
  "GET /v1/rooms/:room/attention": { readonly query: PageRequest; readonly ok: AttentionPage };
  "GET /v1/rooms/:room/log": { readonly query: LogRequest; readonly ok: LogPage };
  "GET /v1/rooms/:room/explain/:act": { readonly ok: Explanation };
  "GET /v1/rooms/:room/members": { readonly ok: Roster };
  "GET /v1/rooms/:room/subscribe": { readonly query: { readonly cursor?: Cursor; readonly waitMs?: number }; readonly ok: Update };
  /**
   * `?cursor=` is optional. The client offers the subprotocols `artroom.v1`
   * and `artroom.token.<token>`; the room answers `artroom.v1` (R-API-12).
   */
  "GET /v1/rooms/:room/ws": {
    readonly query: { readonly cursor?: Cursor };
    readonly upgrade: "websocket";
    readonly protocols: readonly [WsProtocol, WsTokenProtocol];
    readonly message: Update;
  };
  "POST /v1/rooms/:room/mcp": { readonly mcp: "streamable-http" };
}

/** The WebSocket subprotocol the room selects (R-API-12). */
export type WsProtocol = "artroom.v1";
/** The subprotocol that carries a session or bearer token. The room never selects it or echoes it. */
export type WsTokenProtocol = `artroom.token.${string}`;

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
            readonly because?: readonly Reason[];
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
    readonly input: McpHeld &
      McpCommon & { readonly head: Sha; readonly expectedGeneration: Generation; readonly summary: string; readonly because?: readonly Reason[] };
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
  /** Also the MCP form of `subscribe`: call again with the returned cursor. The page is `RoomApi.attention`'s, unchanged. */
  readonly attention: { readonly input: PageRequest; readonly output: AttentionPage };
  /** An unknown act is `ExplainNotFound`, because MCP structured content must be an object (R-API-9). */
  readonly explain: { readonly input: { readonly act: ActId }; readonly output: Explanation | ExplainNotFound };
}

/** The MCP `explain` result for an act the room does not have. `outcome` tells it apart from an `Explanation`. */
export interface ExplainNotFound {
  readonly act: ActId;
  readonly outcome: "not-found";
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
