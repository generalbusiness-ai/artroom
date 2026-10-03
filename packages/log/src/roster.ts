/**
 * Replaying the roster to judge each recorded act's authority at its
 * admission (R-ADM-3, R-ADM-4, R-ADM-5, R-GEN-3 to 9, R-REV-3). This is an
 * independent implementation of the Room's rules, built only from earlier
 * log entries, so `verify` does not trust the Room's code.
 *
 * Who may sign is judged under the vocabulary in force at the entry's seq
 * (`Who`): the legacy table of R-GEN-5 under a `v1` document, and `who.roles`
 * with `admin` implicit under a `v2` one (R-DECL-11). Grants made under a
 * `v2` document carry signed maps from kind to binding (R-DECL-17).
 *
 * It also keeps the roster facts that policy inputs read (R-EVAL-3): each
 * member's role and teams, and the room's active admins and members.
 */

import type {
  ActDeclaration,
  ActId,
  Authority,
  Binding,
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
  TeamId,
} from "@generalbusiness/artroom-contract";
import { ARTROOM_LEGACY_V1 } from "@generalbusiness/artroom-contract";
import { digestBytes, unb64url } from "./crypto.ts";
import { checkedTime } from "./time.ts";

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
  | { readonly ok: false; readonly reason: AuthorityFailure | "kind-undeclared" | "binding-stale"; readonly detail: string };

/**
 * Who may sign what, under the vocabulary in force at an entry's seq. The
 * legacy table under a `v1` document; under a `v2` document, `who.roles`
 * for declared kinds and the legacy table for `renew` and `roster`
 * (R-GEN-5 as amended, R-DECL-11).
 */
export interface Who {
  /** May a member with this role sign this kind (not `roster`, whose ops R-GEN-4 decides)? */
  maySign(role: Role, kind: string): boolean;
  /** The declared kinds in force, their declarations and bindings; null under the legacy vocabulary. */
  readonly declared: { readonly acts: Readonly<Record<string, ActDeclaration>>; readonly bindings: Readonly<Record<string, Binding>> } | null;
}

/** The legacy vocabulary's table (R-GEN-5, R-DECL-1). */
export const LEGACY_WHO: Who = { maySign: (role, kind) => roleMaySign(role, kind as EnvelopeKind), declared: null };

/** A `v2` document's: `admin` implicit, `who.roles` for declared kinds, the legacy table for platform kinds (R-DECL-11). */
export function declaredWho(acts: Readonly<Record<string, ActDeclaration>>, bindings: Readonly<Record<string, Binding>>): Who {
  return {
    maySign: (role, kind) => (Object.hasOwn(acts, kind) ? role === "admin" || (acts[kind]!.who.roles as readonly string[]).includes(role) : roleMaySign(role, kind as EnvelopeKind)),
    declared: { acts, bindings },
  };
}

/** A grant's signed map, as decoded (R-DECL-17). */
type GrantBody = { readonly kinds: readonly string[] | "*"; readonly acts?: Readonly<Record<string, Binding>> };

/**
 * The legacy vocabulary's tables, read from its one frozen description
 * (`ARTROOM_LEGACY_V1`, R-DECL-1), never written out again: the kinds each
 * role may sign, the kinds a legacy delegation may name, and the roster ops
 * by signer.
 */
const ROLE_KINDS = ARTROOM_LEGACY_V1.roles as Readonly<Record<Role, readonly string[]>>;
const DELEGABLE = ARTROOM_LEGACY_V1.delegation.kinds as readonly DelegableKind[];
const ROSTER_OPS = { admin: ARTROOM_LEGACY_V1.rosterOps.admin as readonly string[], others: ARTROOM_LEGACY_V1.rosterOps.others as readonly string[] };
const NOT_RECOVERY_OPS: readonly RosterOp["op"][] = ["join", "delegate", "undelegate"];

/**
 * R-GEN-5 and R-GEN-4: may this role sign this kind (and roster op)? An
 * admin signs every kind: the legacy table lists all of them for it, and
 * `recover` is an admin's (R-DECL-21). With no op, `roster` asks only
 * whether the role signs roster acts in general, which an admin does.
 */
export function roleMaySign(role: Role, kind: EnvelopeKind, op?: RosterOp["op"]): boolean {
  if (kind === "roster") return op === undefined ? role === "admin" : (role === "admin" ? ROSTER_OPS.admin : ROSTER_OPS.others).includes(op);
  if (role === "admin") return true;
  return ROLE_KINDS[role].includes(kind);
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
  /** The kinds granted by name, with `*` already expanded by the grantor's role at the grant (R-ADM-5). */
  kinds: readonly DelegableKind[];
  /** A grant made under a `v2` document: the signed map from declared kind to binding (R-DECL-17). */
  acts: Readonly<Record<string, Binding>> | null;
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
  /** Each team's members, as the last `team` op set them (R-GEN-4). */
  private readonly teams = new Map<TeamId, readonly MemberId[]>();
  private recovery: KeyId;

  constructor(genesis: Genesis) {
    this.members.set(genesis.admin.handle, { role: "admin", active: true });
    this.keys.set(genesis.admin.key, { member: genesis.admin.handle, custody: "client", revoked: null });
    this.recovery = genesis.recovery;
  }

  private revocation(key: KeyId): RevocationReason | null {
    return this.keys.get(key)?.revoked ?? this.loose.get(key) ?? null;
  }

  /**
   * Judge `env`'s authority at an admission at `atMs` (R-ADM-3), by exactly
   * one case. `atMs` must be a finite time: a NaN would make every expiry
   * comparison false, so it throws rather than grant unlimited authority.
   */
  judge(env: Envelope, atMs: number, who: Who = LEGACY_WHO): Judgement {
    if (!Number.isFinite(atMs)) throw new RangeError(`the admission time ${atMs} is not a finite time`);
    const no = (reason: AuthorityFailure | "kind-undeclared" | "binding-stale", detail: string): Judgement => ({ ok: false, reason, detail });
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
      const uncovered = coverage(d, env, who); // V:delegation-covers
      if (uncovered) return no("delegation-invalid", uncovered);
      const lane = laneOf(env);
      if (d.lanes !== "*" && (lane === null || !d.lanes.includes(lane))) return no("delegation-invalid", `delegation does not cover lane ${lane ?? "new"}`);
      const g = this.keys.get(d.grantor);
      if (!g || g.revoked) return no("delegation-invalid", "the grantor key is not active");
      const m = this.members.get(g.member);
      if (!m || !m.active) return no("delegation-invalid", `the grantor ${g.member} is not an active member`);
      if (!who.maySign(m.role, env.kind)) return no("delegation-invalid", `the grantor's role ${m.role} may not sign ${env.kind}`); // V:who-grantor
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
      if (op === "delegate" && who.declared === null) {
        // R-ADM-5, judged when the grant is admitted: only kinds the grantor's role may sign.
        const kinds = (env.body as Extract<RosterOp, { op: "delegate" }>).kinds;
        const may = delegableBy(m.role);
        const beyond = kinds === "*" ? [] : kinds.filter((k) => !may.includes(k));
        if (beyond.length) return no("delegation-invalid", `the role ${m.role} may not grant ${beyond.join(", ")} (R-ADM-5)`);
      }
      // R-DECL-17: a grant, or a room-custody session, admitted under a v2 document names current bindings.
      if (who.declared !== null && op === "delegate") {
        const bad = grantProblem(env.body as GrantBody, m.role, who);
        if (bad) return no(bad.reason, bad.detail);
      }
      if (who.declared !== null && op === "invite") {
        const inv = env.body as Extract<RosterOp, { op: "invite" }>;
        const role = inv.role ?? this.members.get(inv.member)?.role;
        if (inv.session && role) {
          const bad = grantProblem(inv.session as GrantBody, role, who);
          if (bad) return no(bad.reason, `the invitation's session: ${bad.detail}`); // V:invite-session
        }
      }
    } else if (!who.maySign(m.role, env.kind)) return no("role-forbids", `the role ${m.role} may not sign ${env.kind}`); // V:who-roles
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
          expiresMs: checkedTime(op.expiresAt, "expiresAt"),
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
      case "delegate": {
        const acts = (op as GrantBody).acts;
        this.delegations.set(id, {
          grantor: authority.key,
          grantee: op.to,
          kinds: op.kinds === "*" ? delegableBy(authority.role!) : op.kinds,
          acts: acts ?? null,
          lanes: op.lanes,
          expiresMs: checkedTime(op.expiresAt, "expiresAt"),
          revoked: false,
        });
        break;
      }
      case "undelegate": {
        const d = this.delegations.get(op.delegation);
        if (d) d.revoked = true;
        break;
      }
      case "rotate-recovery":
        this.recovery = op.key;
        break;
      case "team":
        this.teams.set(op.team, [...op.members].sort());
        break;
    }
  }

  // ------------------------------------------------- roster facts for policy inputs (R-EVAL-3)

  /** The teams a member is in, by team name, as the room's `teamsOf` lists them. */
  teamsOf(member: MemberId): TeamId[] {
    return [...this.teams.keys()].sort().filter((t) => this.teams.get(t)!.includes(member));
  }

  /** A member's current role, whatever the member's state, or null for no such member. */
  roleOf(member: MemberId): Role | null {
    return this.members.get(member)?.role ?? null;
  }

  /** `admins`: active admins with an active key; `members`: active members (R-EVAL-3, the room's `policyRoom`). */
  counts(): { readonly admins: number; readonly members: number } {
    let admins = 0;
    let members = 0;
    for (const [handle, m] of this.members) {
      if (!m.active) continue;
      members++;
      if (m.role === "admin" && [...this.keys.values()].some((k) => k.member === handle && k.revoked === null)) admins++;
    }
    return { admins, members };
  }

  /** A key's revocation, as evidence validity reads it (R-REV-1, the room's `revocationOf`): its reason, or null. */
  revocationOf(key: KeyId): RevocationReason | null {
    return this.revocation(key);
  }

  /** Active members by role, each list in handle order, to expand `role:` principals (R-POL-5). */
  roles(): Partial<Record<Role, MemberId[]>> {
    const out: Partial<Record<Role, MemberId[]>> = {};
    for (const handle of [...this.members.keys()].sort()) {
      const m = this.members.get(handle)!;
      if (m.active) (out[m.role] ??= []).push(handle);
    }
    return out;
  }
}

/**
 * Whether a delegation covers this act, under the vocabulary in force; the
 * reason when it does not (R-ADM-5, R-DECL-17). A declared kind is covered
 * only by a `v2` grant naming its current binding; a grant from before
 * declared acts covers only the platform kinds it named, or that `*`
 * expanded to (intersection, never acquisition).
 */
function coverage(d: DelegationState, env: Envelope, who: Who): string | null {
  const kind = env.kind as string;
  if (who.declared !== null && Object.hasOwn(who.declared.acts, kind)) {
    const binding = (env as unknown as { binding?: Binding }).binding;
    if (d.acts === null) return `the delegation was granted before declared acts and covers no declared kind such as ${kind}; ask the grantor to delegate again`;
    if (!Object.hasOwn(d.acts, kind)) return `delegation does not cover ${kind}`;
    if (d.acts[kind] !== binding) return `the delegation was granted for an earlier meaning of ${kind}`; // V:grant-binding
    // `who.delegable` is outside the binding (R-DECL-15), so the declaration in force at this act decides, also after the grant was admitted (R-DECL-11).
    if (who.declared.acts[kind]!.who.delegable === false) return `${kind} may not be delegated`; // V:delegation-delegable
    return null;
  }
  // A platform kind (or, under the legacy vocabulary, any kind) is covered by name.
  if (who.declared === null && d.acts !== null) return d.kinds.includes(kind as DelegableKind) ? null : `delegation does not cover ${kind}`;
  return d.kinds.includes(kind as DelegableKind) && (who.declared === null || kind === "renew") ? null : `delegation does not cover ${kind}`;
}

/**
 * R-DECL-17 at a grant's admission under a `v2` document: every key of the
 * map is declared, may be delegated and may be signed by the grantor's role,
 * and names the current binding; every platform kind is one the role may
 * sign.
 */
function grantProblem(grant: GrantBody, role: Role, who: Who): { reason: AuthorityFailure | "kind-undeclared" | "binding-stale"; detail: string } | null {
  const declared = who.declared!;
  for (const k of grant.kinds === "*" ? [] : grant.kinds)
    if (!who.maySign(role, k)) return { reason: "delegation-invalid", detail: `the role ${role} may not grant ${k} (R-ADM-5)` }; // V:grant-platform
  for (const [kind, binding] of Object.entries(grant.acts ?? {})) {
    if (!Object.hasOwn(declared.acts, kind)) return { reason: "kind-undeclared", detail: `the grant names ${kind}, which the document in force does not declare` }; // V:grant-declared
    if (declared.acts[kind]!.who.delegable === false) return { reason: "delegation-invalid", detail: `${kind} may not be delegated (who.delegable)` }; // V:grant-delegable
    if (!who.maySign(role, kind)) return { reason: "delegation-invalid", detail: `the role ${role} may not grant ${kind} (R-ADM-5)` }; // V:grant-role
    if (binding !== declared.bindings[kind]) return { reason: "binding-stale", detail: `the grant names ${binding} for ${kind}; the binding in force is ${declared.bindings[kind]}` }; // V:grant-stale
  }
  return null;
}
