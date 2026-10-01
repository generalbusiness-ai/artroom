/**
 * Replaying the roster to judge each recorded act's authority at its
 * admission (R-ADM-3, R-ADM-4, R-ADM-5, R-GEN-3 to 9, R-REV-3). This is an
 * independent implementation of the Room's rules, built only from earlier
 * log entries, so `verify` does not trust the Room's code.
 */

import type {
  ActId,
  Authority,
  DelegableKind,
  Envelope,
  EnvelopeKind,
  Genesis,
  KeyCustody,
  KeyId,
  LaneId,
  MemberId,
  RevocationReason,
  Role,
  RosterOp,
} from "@generalbusiness/artroom-contract";
import { digestBytes, unb64url } from "./crypto.ts";

/** Why an act's recorded authority is not valid. Each is a named verify failure. */
export type AuthorityFailure =
  | "key-revoked"
  | "not-member"
  | "role-forbids"
  | "admin-required"
  | "recovery-only"
  | "delegation-invalid"
  | "invitation-invalid"
  | "key-in-use"
  | "custody-mismatch";

export type Judgement =
  | { readonly ok: true; readonly authority: Authority }
  | { readonly ok: false; readonly reason: AuthorityFailure; readonly detail: string };

const MEMBER_KINDS: readonly EnvelopeKind[] = ["claim", "propose", "note", "review", "land", "release", "renew"];
const DELEGABLE: readonly DelegableKind[] = ["claim", "propose", "note", "review", "check", "land", "release", "renew"];
const NOT_RECOVERY_OPS: readonly RosterOp["op"][] = ["join", "delegate", "undelegate"];

/** R-GEN-5 and R-GEN-4: may this role sign this kind (and roster op)? */
export function roleMaySign(role: Role, kind: EnvelopeKind, op?: RosterOp["op"]): boolean {
  if (role === "admin") return kind !== "roster" || (op !== "rotate-recovery" && op !== "join");
  if (kind === "roster") return op === "delegate" || op === "undelegate";
  if (role === "checker") return kind === "check" || kind === "note";
  return MEMBER_KINDS.includes(kind);
}

/**
 * R-ADM-5: the kinds a delegation granted by this role covers. A list may
 * name only kinds the role may sign; `*` means all of those, fixed when the
 * delegation is granted. A later role change can narrow it (checked at each
 * use), never widen it.
 */
export function delegableBy(role: Role): readonly DelegableKind[] {
  return DELEGABLE.filter((k) => roleMaySign(role, k));
}

interface MemberState {
  role: Role;
  active: boolean;
}

interface KeyState {
  member: MemberId;
  custody: KeyCustody;
  revoked: RevocationReason | null;
}

interface DelegationState {
  grantor: KeyId;
  grantee: KeyId;
  /** The kinds granted, with `*` already expanded by the grantor's role at the grant (R-ADM-5). */
  kinds: readonly DelegableKind[];
  lanes: readonly LaneId[] | "*";
  expiresMs: number;
  revoked: boolean;
}

interface InvitationState {
  member: MemberId;
  role: Role | undefined;
  custody: KeyCustody;
  expiresMs: number;
  secretHash: string;
  used: boolean;
}

function laneOf(env: Envelope): LaneId | null {
  const t = env.target as { lane?: unknown } | null;
  return t && typeof t.lane === "string" ? (t.lane as LaneId) : null;
}

export class RosterReplay {
  private readonly members = new Map<MemberId, MemberState>();
  private readonly keys = new Map<KeyId, KeyState>();
  /** Revocations of keys that never belonged to a member, such as delegate keys. */
  private readonly loose = new Map<KeyId, RevocationReason>();
  private readonly delegations = new Map<ActId, DelegationState>();
  private readonly invitations = new Map<ActId, InvitationState>();
  private recovery: KeyId;

  constructor(genesis: Genesis) {
    this.members.set(genesis.admin.handle, { role: "admin", active: true });
    this.keys.set(genesis.admin.key, { member: genesis.admin.handle, custody: "client", revoked: null });
    this.recovery = genesis.recovery;
  }

  private revocation(key: KeyId): RevocationReason | null {
    return this.keys.get(key)?.revoked ?? this.loose.get(key) ?? null;
  }

  /** Judge `env`'s authority at an admission at `atMs` (R-ADM-3), by exactly one case. */
  judge(env: Envelope, atMs: number): Judgement {
    const no = (reason: AuthorityFailure, detail: string): Judgement => ({ ok: false, reason, detail });
    const actor = env.actor;
    const op = env.kind === "roster" ? (env.body as RosterOp).op : undefined;
    const revoked = this.revocation(actor);

    // (b) Delegation.
    if (env.delegation !== undefined) {
      if (revoked) return no("key-revoked", `${actor} was revoked (${revoked})`);
      const d = this.delegations.get(env.delegation);
      if (!d) return no("delegation-invalid", `no delegation ${env.delegation}`);
      if (d.revoked) return no("delegation-invalid", `delegation ${env.delegation} was revoked`);
      if (d.expiresMs <= atMs) return no("delegation-invalid", `delegation ${env.delegation} had expired`);
      if (d.grantee !== actor) return no("delegation-invalid", `delegation ${env.delegation} was not granted to ${actor}`);
      if (env.kind === "roster") return no("delegation-invalid", "a delegation never covers roster acts");
      if (!d.kinds.includes(env.kind as DelegableKind)) return no("delegation-invalid", `delegation does not cover ${env.kind}`);
      const lane = laneOf(env);
      if (d.lanes !== "*" && (lane === null || !d.lanes.includes(lane))) return no("delegation-invalid", `delegation does not cover lane ${lane ?? "new"}`);
      const g = this.keys.get(d.grantor);
      if (!g || g.revoked) return no("delegation-invalid", "the grantor key is not active");
      const m = this.members.get(g.member);
      if (!m || !m.active) return no("delegation-invalid", `the grantor ${g.member} is not an active member`);
      if (!roleMaySign(m.role, env.kind)) return no("delegation-invalid", `the grantor's role ${m.role} may not sign ${env.kind}`);
      return { ok: true, authority: { via: "delegation", member: g.member, role: m.role, key: actor, delegation: env.delegation, grantor: d.grantor } };
    }

    // (c) Join.
    if (env.kind === "roster" && op === "join") {
      const body = env.body as Extract<RosterOp, { op: "join" }>;
      const inv = this.invitations.get(body.invitation);
      if (!inv) return no("invitation-invalid", `no invitation ${body.invitation}`);
      if (inv.used) return no("invitation-invalid", "the invitation was already used");
      if (inv.expiresMs <= atMs) return no("invitation-invalid", "the invitation had expired");
      const secret = unb64url(body.secret);
      if (!secret || digestBytes(secret) !== inv.secretHash) return no("invitation-invalid", "the secret does not match");
      if (this.keys.has(actor) || this.loose.has(actor)) return no("key-in-use", `${actor} is already bound or was revoked`);
      const role = inv.role ?? this.members.get(inv.member)?.role;
      if (!role) return no("invitation-invalid", "the invitation adds a key to a member that does not exist");
      return { ok: true, authority: { via: "join", member: inv.member, role, key: actor, invitation: body.invitation, custody: inv.custody } };
    }

    // (d) Recovery.
    if (actor === this.recovery) {
      if (revoked) return no("key-revoked", "the recovery key was revoked");
      if (env.kind !== "roster" || op === undefined || NOT_RECOVERY_OPS.includes(op))
        return no("role-forbids", `the recovery key may not sign ${op ?? env.kind}`);
      return { ok: true, authority: { via: "recovery", member: null, role: null, key: actor } };
    }

    // (a) Direct member.
    const k = this.keys.get(actor);
    if (revoked) return no("key-revoked", `${actor} was revoked (${revoked}) before this act`);
    if (!k) return no("not-member", `${actor} belongs to no member`);
    const m = this.members.get(k.member);
    if (!m || !m.active) return no("not-member", `${k.member} is not an active member`);
    if (env.kind === "roster") {
      if (op === "rotate-recovery") return no("recovery-only", "only the recovery key may rotate it");
      if (!roleMaySign(m.role, "roster", op)) return no("admin-required", `${op} needs an admin`);
      if (op === "undelegate") {
        const d = this.delegations.get((env.body as Extract<RosterOp, { op: "undelegate" }>).delegation);
        if (d && d.grantor !== actor) return no("admin-required", "only the grantor key may undelegate (R-GEN-4)");
      }
      if (op === "delegate") {
        // R-ADM-5, judged when the grant is admitted: only kinds the grantor's role may sign.
        const kinds = (env.body as Extract<RosterOp, { op: "delegate" }>).kinds;
        const may = delegableBy(m.role);
        const beyond = kinds === "*" ? [] : kinds.filter((k) => !may.includes(k));
        if (beyond.length) return no("delegation-invalid", `the role ${m.role} may not grant ${beyond.join(", ")} (R-ADM-5)`);
      }
    } else if (!roleMaySign(m.role, env.kind)) return no("role-forbids", `the role ${m.role} may not sign ${env.kind}`);
    return { ok: true, authority: { via: "member", member: k.member, role: m.role, key: actor } };
  }

  /** Apply an accepted roster act, recorded as entry `id` (R-ID-2). */
  apply(env: Envelope, id: ActId, authority: Authority): void {
    if (env.kind !== "roster") return;
    const op = env.body as RosterOp;
    switch (op.op) {
      case "invite":
        this.invitations.set(id, {
          member: op.member,
          role: op.role,
          custody: op.custody,
          expiresMs: Date.parse(op.expiresAt),
          secretHash: op.secretHash,
          used: false,
        });
        break;
      case "join": {
        const inv = this.invitations.get(op.invitation)!;
        inv.used = true;
        if (!this.members.has(inv.member)) this.members.set(inv.member, { role: inv.role ?? "member", active: true });
        this.keys.set(env.actor, { member: inv.member, custody: inv.custody, revoked: null });
        break;
      }
      case "set-role": {
        const m = this.members.get(op.member);
        if (m) m.role = op.role;
        break;
      }
      case "remove": {
        const m = this.members.get(op.member);
        if (m) m.active = false;
        break;
      }
      case "revoke-key": {
        const k = this.keys.get(op.key);
        if (k) k.revoked = op.reason;
        else this.loose.set(op.key, op.reason);
        if (op.reason === "compromised")
          for (const d of this.delegations.values()) if (d.grantor === op.key || d.grantee === op.key) d.revoked = true;
        break;
      }
      case "delegate":
        this.delegations.set(id, {
          grantor: authority.key,
          grantee: op.to,
          kinds: op.kinds === "*" ? delegableBy(authority.role!) : op.kinds,
          lanes: op.lanes,
          expiresMs: Date.parse(op.expiresAt),
          revoked: false,
        });
        break;
      case "undelegate": {
        const d = this.delegations.get(op.delegation);
        if (d) d.revoked = true;
        break;
      }
      case "rotate-recovery":
        this.recovery = op.key;
        break;
      case "team":
        break;
    }
  }
}
