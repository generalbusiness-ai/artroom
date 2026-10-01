/**
 * Members, roles, keys, delegations, invitations and room genesis
 * (plan section 9). Rules R-GEN, R-ADM, R-REV and R-ADMIN in docs/protocol.md.
 */

import type {
  ActId,
  Base64Url,
  DelegationId,
  Digest,
  InvitationId,
  KeyId,
  LaneId,
  MemberId,
  RoomName,
  Seq,
  TeamId,
  Timestamp,
} from "./ids.ts";
import type { ActKind } from "./acts.ts";

export type Role = "admin" | "maintainer" | "member" | "agent" | "checker";

/** Who may be named as a reviewer, checker, owner or notification target. */
export type Principal = MemberId | TeamId | `role:${Role}`;

/** Why a key was revoked. The two reasons have different effects on evidence (R-REV-2, R-REV-3). */
export type RevocationReason = "retired" | "compromised";

/** Where the private key lives. `room` keys back MCP bearer sessions (R-CRED-3). */
export type KeyCustody = "client" | "room";

export type KeyState =
  | { readonly state: "active" }
  | { readonly state: "revoked"; readonly reason: RevocationReason; readonly at: Seq; readonly by: ActId };

export type KeyInfo = { readonly id: KeyId; readonly custody: KeyCustody; readonly added: Seq } & KeyState;

export interface Member {
  readonly handle: MemberId;
  readonly role: Role;
  readonly teams: readonly TeamId[];
  readonly keys: readonly KeyInfo[];
  readonly state: "active" | "removed";
  readonly joined: Seq;
}

/** Kinds a delegation can grant. Never `roster`; `*` means all of these (R-ADM-5). */
export type DelegableKind = ActKind | "renew";

/** A grant from one key to another: a subset of kinds and lanes, until an expiry (R-ADM-5). */
export interface Delegation {
  readonly id: DelegationId;
  readonly grantor: KeyId;
  readonly grantee: KeyId;
  readonly kinds: readonly DelegableKind[] | "*";
  readonly lanes: readonly LaneId[] | "*";
  readonly expiresAt: Timestamp;
  readonly revoked?: Seq;
}

export interface Invitation {
  readonly id: InvitationId;
  readonly member: MemberId;
  /** Required when `member` is new; must be absent when it adds a key to an existing member. */
  readonly role?: Role;
  /**
   * `client`: redeemed only by a `join` the caller signs and submits.
   * `room`: redeemed only by the room's own redemption, with a key it
   * generates and holds. Enforced by the admission path (R-ADM-12).
   */
  readonly custody: KeyCustody;
  readonly expiresAt: Timestamp;
  /** sha256 of the invitation secret's bytes. The secret is revealed once, by `join` (R-GEN-6). */
  readonly secretHash: Digest;
  /** For room-custody (MCP) invitations: the delegation the bearer session will act under. */
  readonly session?: { readonly kinds: readonly DelegableKind[] | "*"; readonly lanes: "*"; readonly ttlSeconds: number };
  readonly used?: Seq;
}

/**
 * The body of a `roster` act. Who may sign each op (R-GEN-4):
 * - `join`: the invited key itself, once;
 * - `delegate`, `undelegate`: the grantor key (any active member);
 * - `rotate-recovery`: the recovery key only;
 * - every other op: an `admin`, or the recovery key.
 */
export type RosterOp =
  | {
      readonly op: "invite";
      readonly member: MemberId;
      readonly role?: Role;
      readonly custody: KeyCustody;
      readonly expiresAt: Timestamp;
      readonly secretHash: Digest;
      readonly session?: Invitation["session"];
    }
  | { readonly op: "join"; readonly invitation: InvitationId; readonly secret: Base64Url }
  | { readonly op: "set-role"; readonly member: MemberId; readonly role: Role }
  | { readonly op: "remove"; readonly member: MemberId }
  | { readonly op: "revoke-key"; readonly key: KeyId; readonly reason: RevocationReason }
  | { readonly op: "team"; readonly team: TeamId; readonly members: readonly MemberId[] }
  | {
      readonly op: "delegate";
      readonly to: KeyId;
      readonly kinds: readonly DelegableKind[] | "*";
      readonly lanes: readonly LaneId[] | "*";
      readonly expiresAt: Timestamp;
    }
  | { readonly op: "undelegate"; readonly delegation: DelegationId }
  | { readonly op: "rotate-recovery"; readonly key: KeyId };

/**
 * Room genesis: log entry 0. It is signed by the first admin key and names the
 * recovery key and the room key (R-GEN-1). The room ID is derived from it.
 */
export interface Genesis {
  readonly format: "artroom-log-v1";
  readonly name: RoomName;
  /** The canonical repository's Artifacts name. */
  readonly repo: string;
  readonly admin: { readonly handle: MemberId; readonly key: KeyId };
  /** Can always issue roster acts; may be kept offline (R-GEN-3). */
  readonly recovery: KeyId;
  /** Signs system events, entry hashes and checkpoints (R-LOG-4). */
  readonly roomKey: KeyId;
  readonly profile: { readonly policy: "artroom-jsonata-v1"; readonly jsonata: string };
  readonly createdAt: Timestamp;
}

/** The roster as the room holds it at one sequence number. */
export interface Roster {
  readonly at: Seq;
  readonly members: readonly Member[];
  readonly teams: Readonly<Record<TeamId, readonly MemberId[]>>;
  readonly delegations: readonly Delegation[];
  readonly recovery: KeyId;
  /** True while exactly one active admin exists (R-ADMIN-2). */
  readonly soleAdmin: boolean;
}
