/**
 * The roster as the Room holds it: members, keys, teams, delegations and
 * invitations (R-GEN, R-ADM-5). Reads are synchronous over SQLite.
 */

import type {
  DelegableKind,
  Delegation,
  DelegationId,
  EnvelopeKind,
  Invitation,
  InvitationId,
  KeyCustody,
  KeyId,
  KeyInfo,
  Member,
  MemberId,
  RevocationReason,
  Role,
  Roster,
  RosterOp,
  Seq,
  TeamId,
} from "@generalbusiness/artroom-contract";
import type { Sql } from "./ports.ts";
import { getMeta, json, num, one, str } from "./store.ts";

/** Kinds each role may sign (R-GEN-5). Policy cannot widen it. */
const ROLE_KINDS: Readonly<Record<Role, readonly EnvelopeKind[]>> = {
  admin: ["claim", "propose", "note", "review", "check", "land", "release", "renew", "roster"],
  maintainer: ["claim", "propose", "note", "review", "land", "release", "renew", "roster"],
  member: ["claim", "propose", "note", "review", "land", "release", "renew", "roster"],
  agent: ["claim", "propose", "note", "review", "land", "release", "renew", "roster"],
  checker: ["check", "note", "roster"],
};

/** Roster ops each role may sign (R-GEN-4). The non-admin roles may only delegate. */
const MEMBER_ROSTER_OPS: readonly RosterOp["op"][] = ["delegate", "undelegate"];
export const ADMIN_ROSTER_OPS: readonly RosterOp["op"][] = ["invite", "set-role", "remove", "revoke-key", "team", "delegate", "undelegate"];
/** The recovery key may sign any roster op except these (R-GEN-3). */
export const NOT_RECOVERY_OPS: readonly RosterOp["op"][] = ["join", "delegate", "undelegate"];

/** May a role sign this kind, and for `roster`, this op (R-GEN-4, R-GEN-5)? */
export function roleMaySign(role: Role, kind: EnvelopeKind, op?: RosterOp["op"]): boolean {
  if (!ROLE_KINDS[role].includes(kind)) return false;
  if (kind !== "roster") return true;
  if (op === "join" || op === "rotate-recovery") return false;
  return role === "admin" ? ADMIN_ROSTER_OPS.includes(op!) : MEMBER_ROSTER_OPS.includes(op!);
}

/** Kinds a delegation may grant from this role: the role's kinds, never `roster` (R-ADM-5). */
export function delegableBy(role: Role): DelegableKind[] {
  return ROLE_KINDS[role].filter((k): k is DelegableKind => k !== "roster");
}

export interface KeyRow {
  readonly key: KeyId;
  readonly member: MemberId;
  readonly custody: KeyCustody;
  readonly added: Seq;
  readonly state: "active" | "revoked";
  readonly reason: RevocationReason | null;
  readonly revokedAt: Seq | null;
}

export interface MemberRow {
  readonly handle: MemberId;
  readonly role: Role;
  readonly state: "active" | "removed";
  readonly joined: Seq;
}

export function keyRow(sql: Sql, key: string): KeyRow | null {
  const r = one(sql, "SELECT * FROM keys WHERE key = ?", key);
  if (!r) return null;
  return {
    key: str(r, "key") as KeyId,
    member: str(r, "member") as MemberId,
    custody: str(r, "custody") as KeyCustody,
    added: num(r, "added")!,
    state: str(r, "state") as "active" | "revoked",
    reason: str(r, "reason") as RevocationReason | null,
    revokedAt: num(r, "revoked_at"),
  };
}

/** How a key was revoked, whether or not it was ever a member's key. */
export function revocationOf(sql: Sql, key: string): { readonly reason: RevocationReason; readonly at: Seq } | null {
  const k = keyRow(sql, key);
  if (k && k.state === "revoked") return { reason: k.reason!, at: k.revokedAt! };
  const r = one(sql, "SELECT reason, revoked_at FROM revoked_keys WHERE key = ?", key);
  return r ? { reason: str(r, "reason") as RevocationReason, at: num(r, "revoked_at")! } : null;
}

export function memberRow(sql: Sql, handle: string): MemberRow | null {
  const r = one(sql, "SELECT * FROM members WHERE handle = ?", handle);
  if (!r) return null;
  return { handle: str(r, "handle") as MemberId, role: str(r, "role") as Role, state: str(r, "state") as "active" | "removed", joined: num(r, "joined")! };
}

export function isHandleTaken(sql: Sql, handle: string): boolean {
  return !!one(sql, "SELECT 1 AS x FROM members WHERE handle = ? UNION SELECT 1 FROM teams WHERE team = ?", handle, handle);
}

export function activeKeys(sql: Sql, member: string): KeyId[] {
  return sql.all("SELECT key FROM keys WHERE member = ? AND state = 'active'", member).map((r) => str(r, "key") as KeyId);
}

/** Active admins: active members with role admin and at least one active key (R-GEN-9). */
export function activeAdmins(sql: Sql): MemberId[] {
  return sql
    .all(
      "SELECT DISTINCT m.handle FROM members m JOIN keys k ON k.member = m.handle WHERE m.role = 'admin' AND m.state = 'active' AND k.state = 'active' ORDER BY m.handle",
    )
    .map((r) => str(r, "handle") as MemberId);
}

export function activeMembers(sql: Sql): MemberRow[] {
  return sql.all("SELECT * FROM members WHERE state = 'active' ORDER BY handle").map((r) => memberRow(sql, str(r, "handle")!)!);
}

export function teamsOf(sql: Sql, member: string): TeamId[] {
  return sql
    .all("SELECT team, members FROM teams ORDER BY team")
    .filter((r) => (JSON.parse(str(r, "members")!) as string[]).includes(member))
    .map((r) => str(r, "team") as TeamId);
}

export function teamMembers(sql: Sql, team: string): MemberId[] {
  return json<MemberId[]>(one(sql, "SELECT members FROM teams WHERE team = ?", team), "members") ?? [];
}

export function delegation(sql: Sql, id: string): (Delegation & { readonly expiresMs: number }) | null {
  const r = one(sql, "SELECT * FROM delegations WHERE id = ?", id);
  if (!r) return null;
  const revoked = num(r, "revoked");
  return {
    id: str(r, "id") as DelegationId,
    grantor: str(r, "grantor") as KeyId,
    grantee: str(r, "grantee") as KeyId,
    kinds: JSON.parse(str(r, "kinds")!) as Delegation["kinds"],
    lanes: JSON.parse(str(r, "lanes")!) as Delegation["lanes"],
    expiresAt: str(r, "expires_at")!,
    expiresMs: num(r, "expires_ms")!,
    ...(revoked !== null ? { revoked } : {}),
  };
}

export function invitation(sql: Sql, id: string): (Invitation & { readonly expiresMs: number }) | null {
  const r = one(sql, "SELECT * FROM invitations WHERE id = ?", id);
  if (!r) return null;
  const role = str(r, "role");
  const session = json<Invitation["session"]>(r, "session");
  const used = num(r, "used");
  return {
    id: str(r, "id") as InvitationId,
    member: str(r, "member") as MemberId,
    ...(role ? { role: role as Role } : {}),
    custody: str(r, "custody") as KeyCustody,
    expiresAt: str(r, "expires_at")!,
    expiresMs: num(r, "expires_ms")!,
    secretHash: str(r, "secret_hash") as Invitation["secretHash"],
    ...(session ? { session } : {}),
    ...(used !== null ? { used } : {}),
  };
}

export function recoveryKey(sql: Sql): KeyId {
  return getMeta(sql, "recovery") as KeyId;
}

/** The roster at the current head, as `members()` returns it. */
export function rosterView(sql: Sql, at: Seq): Roster {
  const members: Member[] = sql.all("SELECT * FROM members ORDER BY handle").map((r) => {
    const handle = str(r, "handle") as MemberId;
    const keys: KeyInfo[] = sql.all("SELECT * FROM keys WHERE member = ? ORDER BY added", handle).map((k) => {
      const base = { id: str(k, "key") as KeyId, custody: str(k, "custody") as KeyCustody, added: num(k, "added")! };
      return str(k, "state") === "revoked"
        ? { ...base, state: "revoked" as const, reason: str(k, "reason") as RevocationReason, at: num(k, "revoked_at")!, by: str(k, "revoked_by") as KeyInfo["id"] & `act_${number}_${string}` }
        : { ...base, state: "active" as const };
    });
    return {
      handle,
      role: str(r, "role") as Role,
      teams: teamsOf(sql, handle),
      keys,
      state: str(r, "state") as "active" | "removed",
      joined: num(r, "joined")!,
    };
  });
  const teams: Record<TeamId, readonly MemberId[]> = {};
  for (const r of sql.all("SELECT team, members FROM teams ORDER BY team")) teams[str(r, "team") as TeamId] = JSON.parse(str(r, "members")!) as MemberId[];
  const delegations: Delegation[] = sql.all("SELECT id FROM delegations ORDER BY id").map((r) => {
    const d = delegation(sql, str(r, "id")!)!;
    const { expiresMs, ...rest } = d;
    void expiresMs;
    return rest;
  });
  return { at, members, teams, delegations, recovery: recoveryKey(sql), soleAdmin: activeAdmins(sql).length === 1 };
}
