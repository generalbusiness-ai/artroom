/**
 * Identifiers and scalar formats. docs/protocol.md section 2 defines each
 * format; guards.ts checks them. Rule references (R-ID-n) point there.
 */

declare const brand: unique symbol;
/** A nominal type: a string that has passed a format guard. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/** A git object name: 40 lowercase hex characters (R-ID-6). */
export type Sha = Brand<string, "Sha">;

/** A SHA-256 digest of canonical bytes: `sha256:` + 64 lowercase hex characters (R-ID-7). */
export type Digest = `sha256:${string}`;

/** Unpadded base64url (RFC 4648 section 5). Used for keys and signatures. */
export type Base64Url = string;

/**
 * The room-scoped ID of one log entry: `act_<seq>_<hash8>` (R-ID-1).
 * Acts, recorded refusals and system events all have one.
 */
export type ActId = `act_${number}_${string}`;

/** A lane's ID is the ID of the claim that opened it (R-ID-2). */
export type LaneId = ActId;

/** A delegation's ID is the ID of the roster act that granted it. */
export type DelegationId = ActId;

/** An invitation's ID is the ID of the roster act that issued it. */
export type InvitationId = ActId;

/** A policy version is the ID of the system event that activated it. */
export type PolicyVersion = ActId;

/** A position in the room's log. Genesis is 0. */
export type Seq = number;

/** A proposal generation within a lane. 0 means "nothing proposed yet". */
export type Generation = number;

/** A lease generation within a lane. It increases on every new holder and every expiry. */
export type LeaseGeneration = number;

/** A publication number. It increases by one per reservation of the publication slot. */
export type PublicationNo = number;

/** A room's ID: `room_` + the first 32 hex characters of the genesis digest (R-ID-3). */
export type RoomId = `room_${string}`;

/** A room's human name, for example `acme/web`. Not unique over time; never signed. */
export type RoomName = string;

/** An Ed25519 public key: `key_` + base64url of its 32 raw bytes (R-ID-4). */
export type KeyId = `key_${string}`;

/** A member's handle, for example `@alice` (R-ID-5). */
export type MemberId = `@${string}`;

/** A team's handle, from the roster. Same namespace as members. */
export type TeamId = `@${string}`;

/** An operation ID: `op_` + room-chosen characters (R-ID-8). */
export type OpId = `op_${string}`;

/** An obligation ID: `obl_` + the rule ID that created it. Unique within one proposal. */
export type ObligationId = `obl_${string}`;

/** A policy rule ID: `[a-z][a-z0-9-]{0,63}`. */
export type RuleId = string;

/** A checker name: `[a-z][a-z0-9-]{0,63}`. Its configuration is `.artroom/checkers/<name>.json`. */
export type CheckerName = string;

/**
 * A path pattern in the restricted glob syntax (R-PATH-1): `/`-separated
 * segments; a segment is `**`, or literal text in which `*` matches any run
 * of characters other than `/`.
 */
export type Glob = string;

/** A repository path: `/`-separated, no leading `/`, no `.` or `..` segments. */
export type RepoPath = string;

/** RFC 3339 UTC time with a `Z` suffix. Informational unless a rule says otherwise. */
export type Timestamp = string;

/** An idempotency key: 1–64 characters from `[A-Za-z0-9_-]` (R-IDEM-1). */
export type IdempotencyKey = string;

/** An opaque, resumable position in a paginated read. */
export type Cursor = Brand<string, "Cursor">;

/** The pinned ref for one proposal generation (R-PROP-1, R-PROP-2). Never moves. */
export type PinnedRef = `refs/artroom/heads/${LaneId}/${Generation}`;

/** Plain JSON, as canonicalized by RFC 8785. Numbers must be safe integers (R-SIG-3). */
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

/** A reference to something an act rests on (section 4, "Context preservation"). */
export type Reason =
  | { readonly act: ActId }
  | { readonly commit: Sha }
  | { readonly url: `https://${string}` };
