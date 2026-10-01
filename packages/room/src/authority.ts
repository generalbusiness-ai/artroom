/**
 * Authority at admission, by exactly one of four cases (R-ADM-3), and the
 * invitation custody check on the join case (R-ADM-12). The actor's identity
 * comes from the verified signature only (R-ADM-2).
 *
 * Every refusal here is unrecorded (R-ADM-1 step 4, R-ADM-8).
 */

import type {
  AdmissionPath,
  Authority,
  DelegableKind,
  Envelope,
  EnvelopeKind,
  Flag,
  KeyId,
  LaneId,
  Refusal,
  RosterOp,
} from "@generalbusiness/artroom-contract";
import { digestBytes, unb64url } from "./crypto.ts";
import type { Sql } from "./ports.ts";
import { delegation, invitation, keyRow, memberRow, NOT_RECOVERY_OPS, recoveryKey, revocationOf, roleMaySign } from "./roster.ts";

export type Judged =
  | { readonly ok: true; readonly authority: Authority; readonly flags: readonly Flag[] }
  | { readonly ok: false; readonly refusal: Refusal };

export function refusal(rule: Refusal["rule"], reason: string, fix?: string, extra: Partial<Refusal> = {}): Refusal {
  return { refused: true, rule, reason, ...(fix ? { fix } : {}), ...extra };
}

const no = (rule: Refusal["rule"], reason: string, fix?: string): Judged => ({ ok: false, refusal: refusal(rule, reason, fix) });

/** The lane an envelope acts on, if any: what a delegation's `lanes` must cover. */
export function laneOf(env: Pick<Envelope, "kind" | "target">): LaneId | null {
  const t = env.target as { lane?: LaneId; act?: string } | null;
  return t && typeof t.lane === "string" ? t.lane : null;
}

function opOf(env: Pick<Envelope, "kind" | "body">): RosterOp["op"] | undefined {
  return env.kind === "roster" ? (env.body as RosterOp).op : undefined;
}

/** Is this envelope a `join` with no delegation (case c)? */
export function isJoin(env: Pick<Envelope, "kind" | "body" | "delegation">): boolean {
  return env.kind === "roster" && (env.body as RosterOp).op === "join" && env.delegation === undefined;
}

/**
 * Judge an act's authority now. `kind` and `lane` default to the envelope's;
 * requests judge "as for propose on that lane" (R-CRED-5) by passing them.
 */
export function judge(
  sql: Sql,
  env: Pick<Envelope, "actor" | "kind" | "target" | "body" | "delegation">,
  path: AdmissionPath,
  nowMs: number,
  as?: { readonly kind: EnvelopeKind; readonly lane: LaneId | null },
): Judged {
  const kind = as?.kind ?? env.kind;
  const lane = as ? as.lane : laneOf(env);
  const actor = env.actor;
  const op = as ? undefined : opOf(env);

  // (b) Delegation: the envelope names one.
  if (env.delegation !== undefined) return judgeDelegation(sql, actor, env.delegation, kind, op, lane, nowMs);

  // (c) Join.
  if (!as && isJoin(env)) return judgeJoin(sql, actor, env.body as Extract<RosterOp, { op: "join" }>, path, nowMs);

  // (d) Recovery key.
  if (actor === recoveryKey(sql)) {
    if (kind !== "roster" || op === undefined || NOT_RECOVERY_OPS.includes(op))
      return no("role-forbids", `The recovery key may sign only roster ops other than join, delegate and undelegate; this is ${op ?? kind}.`, "Sign this act with a member's key.");
    return { ok: true, authority: { via: "recovery", member: null, role: null, key: actor }, flags: ["recovery-key"] };
  }

  // (a) Direct member.
  const key = keyRow(sql, actor);
  if (!key) {
    if (revocationOf(sql, actor)) return no("key-revoked", "The signing key has been revoked.", "Sign with an active key.");
    return no("not-member", "The signing key belongs to no member of this room.", "Join the room with an invitation, or sign under a delegation.");
  }
  if (key.state === "revoked") return no("key-revoked", `The signing key was revoked (${key.reason}) at seq ${key.revokedAt}.`, "Sign with an active key.");
  const member = memberRow(sql, key.member);
  if (!member || member.state !== "active") return no("not-member", `${key.member} is not an active member.`, "Ask an admin to restore the member.");
  if (kind === "roster") {
    if (op === "rotate-recovery") return no("recovery-only", "Only the recovery key can sign rotate-recovery.", "Sign with the recovery key.");
    if (!roleMaySign(member.role, kind, op))
      return no("admin-required", `Only an admin or the recovery key can sign the roster op ${op}.`, "Ask an admin to do this.");
  } else if (!roleMaySign(member.role, kind)) {
    return no("role-forbids", `The role ${member.role} may not sign ${kind}.`, "Ask an admin for a role that may.");
  }
  return { ok: true, authority: { via: "member", member: member.handle, role: member.role, key: actor }, flags: [] };
}

function judgeDelegation(
  sql: Sql,
  actor: KeyId,
  id: string,
  kind: EnvelopeKind,
  op: RosterOp["op"] | undefined,
  lane: LaneId | null,
  nowMs: number,
): Judged {
  // In every case the signing key must not be revoked (R-ADM-3).
  const own = revocationOf(sql, actor);
  if (own) return no("key-revoked", `The signing key was revoked (${own.reason}) at seq ${own.at}.`, "Sign with an active key.");
  const d = delegation(sql, id);
  if (!d) return no("delegation-invalid", `There is no delegation ${id}.`, "Name a delegation granted to this key.");
  if (d.revoked !== undefined) return no("delegation-invalid", `Delegation ${id} was revoked at seq ${d.revoked}.`, "Ask the grantor for a new delegation.");
  if (d.expiresMs <= nowMs) return no("delegation-invalid", `Delegation ${id} expired at ${d.expiresAt}.`, "Ask the grantor for a new delegation.");
  if (d.grantee !== actor) return no("delegation-invalid", `Delegation ${id} was not granted to this key.`, "Sign under a delegation granted to this key.");
  // A delegation never covers roster acts, so a delegated key cannot re-delegate (R-ADM-5).
  if (kind === "roster") return no("delegation-invalid", `A delegation cannot cover roster acts${op ? ` (${op})` : ""}.`, "Sign roster acts with your own key.");
  const kinds = d.kinds;
  if (kinds !== "*" && !kinds.includes(kind as DelegableKind)) return no("delegation-invalid", `Delegation ${id} does not cover ${kind}.`, "Ask the grantor for a delegation that covers it.");
  if (d.lanes !== "*" && (lane === null || !d.lanes.includes(lane)))
    return no("delegation-invalid", `Delegation ${id} does not cover ${lane ?? "new lanes"}.`, "Ask the grantor for a delegation that covers this lane.");
  const grantor = keyRow(sql, d.grantor);
  if (!grantor || grantor.state !== "active")
    return no("delegation-invalid", `The grantor key of delegation ${id} is no longer active.`, "Ask a member for a new delegation.");
  const member = memberRow(sql, grantor.member);
  if (!member || member.state !== "active")
    return no("delegation-invalid", `The grantor ${grantor.member} is no longer an active member.`, "Ask a member for a new delegation.");
  // A grantor's later loss of a kind stops the delegation covering it (R-ADM-5).
  if (!roleMaySign(member.role, kind)) return no("delegation-invalid", `The grantor's role ${member.role} may no longer sign ${kind}.`, "Ask a member whose role may sign it.");
  return {
    ok: true,
    authority: { via: "delegation", member: member.handle, role: member.role, key: actor, delegation: d.id, grantor: d.grantor },
    flags: [],
  };
}

function judgeJoin(sql: Sql, actor: KeyId, body: Extract<RosterOp, { op: "join" }>, path: AdmissionPath, nowMs: number): Judged {
  const inv = invitation(sql, body.invitation);
  if (!inv) return no("invitation-invalid", "The invitation does not exist.", "Ask an admin for a new invitation.");
  if (inv.used !== undefined) return no("invitation-invalid", "The invitation has already been used.", "Ask an admin for a new invitation.");
  if (inv.expiresMs <= nowMs) return no("invitation-invalid", `The invitation expired at ${inv.expiresAt}.`, "Ask an admin for a new invitation.");
  const secret = unb64url(body.secret);
  if (!secret || digestBytes(secret) !== inv.secretHash)
    return no("invitation-invalid", "The secret does not match the invitation.", "Check the secret you were given.");
  // The signing key must not be bound to any member, and never revoked (R-ADM-3c).
  if (keyRow(sql, actor) || revocationOf(sql, actor))
    return no("key-in-use", "The signing key is already bound to a member, or was revoked.", "Make a new key and sign the join with it.");
  // Custody is enforced by the admission path, which the room's code sets (R-ADM-12).
  const allowed = path === "room-redemption" ? "room" : "client";
  if (inv.custody !== allowed)
    return no(
      "custody-mismatch",
      inv.custody === "room"
        ? "This invitation is for a room-held key; it can be redeemed only through redeem with custody room."
        : "This invitation is for a key the client holds; it can be redeemed only with a join the client signs.",
      inv.custody === "room" ? "Send the invitation ID and secret to redeem with custody room." : "Make a key, sign a join, and send it to redeem with custody client.",
    );
  const existing = memberRow(sql, inv.member);
  const role = inv.role ?? existing?.role;
  if (!role) return no("invitation-invalid", "The invitation adds a key to a member that does not exist.", "Ask an admin for a new invitation.");
  if (existing && existing.state !== "active") return no("invitation-invalid", `${inv.member} has been removed.`, "Ask an admin for a new invitation.");
  return {
    ok: true,
    authority: { via: "join", member: inv.member, role, key: actor, invitation: inv.id, custody: inv.custody },
    flags: [],
  };
}
