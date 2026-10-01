/**
 * Signed requests that are not recorded (R-CRED-5, R-CRED-6), redemption
 * (R-CRED-9, R-ADM-12), bearer acts (R-CRED-3) and read sessions (R-CRED-7).
 *
 * Workspace operations are public; their write token is not (R-WS). A token
 * is minted for each retrieval, returned once, and never stored: the room
 * keeps only its ID, to revoke it when the lease ends (R-WS-3, R-WS-4).
 */

import type {
  ActRecord,
  DelegationId,
  Envelope,
  InvitationId,
  Joined,
  KeyId,
  LaneId,
  MemberId,
  Redeemed,
  Refusal,
  RosterRecord,
  Session,
  SessionToken,
  SignedEnvelope,
  SignedRequest,
  WorkspaceGrant,
  WorkspaceOp,
} from "@generalbusiness/artroom-contract";
import { isRefusal } from "@generalbusiness/artroom-contract";
import { commit, decide, earlySteps, finalBoundary, refuseApplies, refuseInput, submit, type DecideOptions } from "./admission.ts";
import { judge, refusal } from "./authority.ts";
import { utf8 } from "./canonical.ts";
import { fault, Moved, type RoomCore } from "./core.ts";
import { digestBytes, digestJson, newKeyPair, randomToken, sha256Hex, sign, unb64url, verify } from "./crypto.ts";
import { artroomError } from "./errors.ts";
import { iso, opIds, parseTime, RE } from "./ids.ts";
import { laneRow } from "./model.ts";
import { delegation, invitation, keyRow, memberRow, revocationOf } from "./roster.ts";
import { checkRedemption, checkSignedRequest, isPlainObject, ShapeError } from "./schema.ts";
import { num, one, str } from "./store.ts";

export const tokenHash = (token: string) => sha256Hex(utf8(token));

// ------------------------------------------------------------ signed requests

export async function request(core: RoomCore, input: unknown): Promise<WorkspaceOp | WorkspaceGrant | Session | Refusal> {
  try {
    checkSignedRequest(input);
  } catch (e) {
    throw artroomError("bad-request", e instanceof ShapeError ? e.message : "The request is not a signed request.");
  }
  const signed = input as SignedRequest;
  const r = signed.request;
  if (r.room !== core.roomId) throw artroomError("unauthenticated", "The request names a different room.");
  if (!(await verify(r.actor, "artroom-request-v1", r, signed.sig))) throw artroomError("unauthenticated", "The signature does not verify for the actor key.");
  // R-CRED-6: notAfter in the window, nonce unseen for this key.
  const now = core.now();
  const notAfter = parseTime(r.notAfter)!;
  if (notAfter < now || notAfter > now + 300_000) throw artroomError("unauthenticated", "The request's notAfter is outside the room's 300-second window.");
  core.sql.all("DELETE FROM nonces WHERE expires_ms < ?", now);
  if (one(core.sql, "SELECT 1 AS x FROM nonces WHERE key = ? AND nonce = ?", r.actor, r.nonce)) throw artroomError("unauthenticated", "This nonce was already used.");
  core.sql.all("INSERT INTO nonces (key, nonce, expires_ms) VALUES (?, ?, ?)", r.actor, r.nonce, notAfter);

  const body = r.request;
  if (body.kind === "session") {
    const who = reader(core, r.actor, r.delegation ?? null);
    if ("refused" in who) return who;
    return newSession(core, who.member, r.actor, r.delegation ?? null, Math.min(body.ttlSeconds, 3600));
  }
  return workspaceRequest(core, r.actor, r.delegation, body);
}

/**
 * `workspace` and `workspace-token`, for a signed request or for a bearer
 * session (R-CRED-5, R-CRED-10): judged as for `propose` on that lane, now,
 * under the key and delegation given (R-WS-2).
 */
async function workspaceRequest(
  core: RoomCore,
  actor: KeyId,
  delegationId: DelegationId | undefined,
  body: Exclude<SignedRequest["request"]["request"], { kind: "session" }>,
): Promise<WorkspaceOp | WorkspaceGrant | Refusal> {
  const r = { actor, delegation: delegationId };
  const now = core.now();
  const holder = workspaceAuthority(core, r.actor, r.delegation, body.lane, body.lease);
  if ("refused" in holder) return holder;
  const lane = holder.lane;
  const opId = opIds.workspace(lane.seq, lane.leaseGen);
  if (body.kind === "workspace") {
    const existing = one(core.sql, "SELECT body FROM workspaces WHERE id = ?", opId);
    if (existing) return JSON.parse(str(existing, "body")!) as WorkspaceOp;
    const op: WorkspaceOp = { id: opId, kind: "workspace", updatedAt: iso(now), lane: lane.id, state: "pending" };
    core.sql.all("INSERT INTO workspaces (id, lane, lease_gen, state, body, updated_ms) VALUES (?, ?, ?, 'pending', ?, ?)", opId, lane.id, lane.leaseGen, JSON.stringify(op), now);
    core.run("workspaces");
    core.committed();
    return op;
  }
  const row = one(core.sql, "SELECT body FROM workspaces WHERE id = ?", opId);
  const op = row ? (JSON.parse(str(row, "body")!) as WorkspaceOp) : null;
  if (!op || op.state !== "ready")
    return refusal("workspace-not-ready", "The workspace for this lease is not ready.", "Open the workspace and wait for it to be ready.", { current: { op: opId } });
  const minted = await core.ports.artifacts.mintForkToken(lane.id, lane.leaseGen, lane.expiresMs!).catch(() => {
    throw artroomError("unavailable", "A workspace token could not be minted. Retry.");
  });
  // Re-validate after the await: the lease may have ended meanwhile (R-ADM-6, R-WS-2).
  const again = workspaceAuthority(core, r.actor, r.delegation, body.lane, body.lease);
  if ("refused" in again) {
    await core.ports.artifacts.revokeForkToken(lane.id, minted.id).catch(() => undefined);
    return again;
  }
  core.sql.all("INSERT INTO fork_tokens (id, lane, lease_gen, revoked) VALUES (?, ?, ?, 0)", minted.id, lane.id, lane.leaseGen);
  const expiresAt = Math.min(minted.expiresAt, again.lane.expiresMs!);
  return { op: opId, lane: lane.id, leaseGeneration: lane.leaseGen, remote: op.detail.remote, token: minted.token, expiresAt: iso(expiresAt) };
}

function workspaceAuthority(core: RoomCore, actor: KeyId, delegationId: DelegationId | undefined, laneId: LaneId, lease: number) {
  const env = { actor, kind: "propose" as const, target: { lane: laneId }, body: {} as never, ...(delegationId ? { delegation: delegationId } : {}) };
  const j = judge(core.sql, env as Pick<Envelope, "actor" | "kind" | "target" | "body" | "delegation">, "submitted", core.now(), { kind: "propose", lane: laneId });
  if (!j.ok) return j.refusal;
  const lane = laneRow(core.sql, laneId);
  if (!lane) return refusal("lane-unknown", `There is no lane ${laneId}.`, "Name an existing lane.");
  if (lane.purpose === "config-recovery" && !(j.authority.via === "member" && j.authority.role === "admin"))
    return refusal("admin-required", "Only an active admin's own key may open a configuration-recovery workspace.", "Sign with an admin's own key.");
  if (lane.state !== "held" || lane.holder !== j.authority.member)
    return refusal("not-holder", `Only the lane's holder may open its workspace or retrieve its token.`, "Claim the lane first.", { current: { leaseGeneration: lane.leaseGen } });
  if (lease !== lane.leaseGen) return refusal("lease-fenced", `The request carries lease generation ${lease}; the current one is ${lane.leaseGen}.`, "Use the current lease.", { current: { leaseGeneration: lane.leaseGen } });
  return { lane, member: j.authority.member! };
}

// ------------------------------------------------------------ read sessions (R-CRED-7)

/** Case (a), or case (b) with the session's member being the grantor's (R-CRED-5). */
function reader(core: RoomCore, actor: KeyId, delegationId: string | null): { member: MemberId } | Refusal {
  const sql = core.sql;
  if (revocationOf(sql, actor)) return refusal("key-revoked", "The signing key has been revoked.", "Sign with an active key.");
  if (delegationId) {
    const d = delegation(sql, delegationId);
    if (!d || d.revoked !== undefined || d.expiresMs <= core.now() || d.grantee !== actor) return refusal("delegation-invalid", "The delegation is not valid for this key.", "Ask the grantor for a new delegation.");
    const g = keyRow(sql, d.grantor);
    const m = g && g.state === "active" ? memberRow(sql, g.member) : null;
    if (!m || m.state !== "active") return refusal("delegation-invalid", "The grantor is no longer an active member.", "Ask a member for a new delegation.");
    return { member: m.handle };
  }
  const k = keyRow(sql, actor);
  const m = k && k.state === "active" ? memberRow(sql, k.member) : null;
  if (!m || m.state !== "active") return refusal("not-member", "The signing key belongs to no active member.", "Join the room first.");
  return { member: m.handle };
}

function newSession(core: RoomCore, member: MemberId, key: KeyId, delegationId: string | null, ttlSeconds: number): Session {
  const token = `ses_${randomToken()}` as SessionToken;
  const expires = core.now() + ttlSeconds * 1000;
  core.sql.all("INSERT INTO sessions (hash, member, key, delegation, expires_ms) VALUES (?, ?, ?, ?, ?)", tokenHash(token), member, key, delegationId, expires);
  return { token, member, expiresAt: iso(expires) };
}

/** The member behind a session or bearer token, judged now (R-CRED-7, R-API-3). */
export function authenticateRead(core: RoomCore, token: string): MemberId {
  return authenticateHash(core, tokenHash(token));
}

/** As `authenticateRead`, from the token's hash: what a WebSocket keeps (R-API-12). */
export function authenticateHash(core: RoomCore, h: string): MemberId {
  const sql = core.sql;
  const now = core.now();
  const s = one(sql, "SELECT * FROM sessions WHERE hash = ?", h) ?? one(sql, "SELECT member, key, delegation, expires_ms FROM bearers WHERE hash = ?", h);
  const fail = () => artroomError("unauthenticated", "The session or bearer token is not valid.");
  if (!s || num(s, "expires_ms")! <= now) throw fail();
  const key = str(s, "key")!;
  if (revocationOf(sql, key)) throw fail();
  const d = str(s, "delegation");
  if (d) {
    const dl = delegation(sql, d);
    if (!dl || dl.revoked !== undefined || dl.expiresMs <= now) throw fail();
    if (revocationOf(sql, dl.grantor)) throw fail();
  }
  const m = memberRow(sql, str(s, "member")!);
  if (!m || m.state !== "active") throw fail();
  return m.handle;
}

// ------------------------------------------------------------ redemption (R-CRED-9)

const limits = new Map<string, { n: number; since: number }>();

function rateLimit(key: string, max: number, now: number): void {
  const w = limits.get(key);
  if (!w || now - w.since > 60_000) {
    limits.set(key, { n: 1, since: now });
    return;
  }
  w.n++;
  if (w.n > max) throw artroomError("rate-limited", "Too many redemption attempts. Wait a minute and try again.", { retryAfterMs: 60_000 - (now - w.since) });
}

export async function redeem(core: RoomCore, input: unknown, address: string, mcpBase: string): Promise<Joined | Redeemed | Refusal> {
  try {
    checkRedemption(input);
  } catch (e) {
    throw artroomError("bad-request", e instanceof ShapeError ? e.message : "The redemption is not valid.");
  }
  const r = input as { custody: "client"; join: SignedEnvelope } | { custody: "room"; invitation: InvitationId; secret: string };
  const now = core.now();
  const invitationId = r.custody === "client" ? (r.join.envelope.body as { invitation?: string }).invitation ?? "none" : r.invitation;
  rateLimit(`addr:${core.roomId}:${address}`, 20, now);
  rateLimit(`inv:${core.roomId}:${invitationId}`, 10, now);

  if (r.custody === "client") {
    const body = r.join.envelope.body as { op?: string };
    if (r.join.envelope.kind !== "roster" || body.op !== "join" || r.join.envelope.delegation !== undefined)
      throw artroomError("bad-request", "A client-custody redemption carries a signed join.");
    // The same admission as any act, on the `submitted` path (R-ADM-12). A refusal records nothing (R-CRED-9).
    const out = await submit(core, r.join, "submitted", { recordRefusals: false });
    if (isRefusal(out)) return out;
    const record = out as RosterRecord;
    const by = record.by as Extract<RosterRecord["by"], { via: "join" }>;
    return { custody: "client", member: by.member, role: by.role, key: by.key, record, session: newSession(core, by.member, by.key, null, 3600) };
  }
  return redeemRoom(core, r.invitation, r.secret, mcpBase);
}

class Abort extends Error {
  constructor(readonly refusal: Refusal) {
    super("redemption refused at the final boundary");
  }
}

/**
 * Room-custody redemption (R-CRED-3, R-CRED-9, R-ADM-12), all or nothing.
 *
 * 1. Custody and secret are checked before any key is made.
 * 2. The `join` is decided on the `room-redemption` path; the `delegate` to
 *    the session key is decided on the state after the join, simulated and
 *    rolled back, with its policy evaluated outside any transaction.
 * 3. One synchronous transaction re-checks both at the final boundary, then
 *    seals the join and the delegate, stores the room-held keys and the
 *    bearer hash. A refusal or failure at any point records nothing, makes
 *    no key and leaves the invitation unused.
 */
async function redeemRoom(core: RoomCore, invitationId: InvitationId, secretText: string, mcpBase: string): Promise<Redeemed | Refusal> {
  const now = core.now();
  const inv = invitation(core.sql, invitationId);
  const secret = unb64url(secretText);
  if (!inv || inv.used !== undefined || inv.expiresMs <= now || !secret || digestBytes(secret) !== inv.secretHash)
    return refusal("invitation-invalid", "The invitation does not exist, was used, expired, or the secret does not match.", "Ask an admin for a new invitation.");
  if (inv.custody !== "room")
    return refusal(
      "custody-mismatch",
      "This invitation is for a key the client holds; it can be redeemed only with a join the client signs.",
      "Make a key, sign a join, and send it to redeem with custody client.",
    );
  const memberKey = newKeyPair();
  const sessionKey = newKeyPair();
  const ttl = inv.session?.ttlSeconds ?? 24 * 3600;
  const expiresMs = now + ttl * 1000;
  const signed = (env: Envelope): SignedEnvelope => ({ envelope: env, sig: sign(memberKey.seed, "artroom-envelope-v1", env) });
  const join = signed({
    v: 1,
    room: core.roomId,
    actor: memberKey.key,
    kind: "roster",
    target: null,
    body: { op: "join", invitation: inv.id, secret: secretText },
    idempotencyKey: `redeem-${randomToken().slice(0, 32)}`,
  });
  const grant = signed({
    v: 1,
    room: core.roomId,
    actor: memberKey.key,
    kind: "roster",
    target: null,
    body: { op: "delegate", to: sessionKey.key, kinds: inv.session?.kinds ?? "*", lanes: "*", expiresAt: iso(expiresMs) },
    idempotencyKey: `session-${randomToken().slice(0, 32)}`,
  });

  return core.serial(async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      core.expireDueSync();
      const snap = core.headSeq();
      const joinPlan = await decide(core, join, "room-redemption", {});
      if (joinPlan.t === "replay") throw artroomError("internal", "A fresh redemption key was already used.");
      if (joinPlan.t !== "accept") return joinPlan.refusal;
      // The delegate, as it would be judged after the join (simulated, then rolled back).
      const sim = core.simulate(() => {
        commit(core, joinPlan, {});
        const j = judge(core.sql, grant.envelope, "submitted", core.now());
        if (!j.ok) return { refusal: j.refusal } as const;
        const early = earlySteps(core, grant, "submitted", digestJson(grant.envelope), j.authority);
        if (early) return { refusal: early.t === "unrecorded" ? early.refusal : refusal("invalid-body", "The session grant was refused.") } as const;
        return { authority: j.authority, input: refuseApplies(grant.envelope, j.authority) ? refuseInput(core, grant.envelope, j.authority, null) : null } as const;
      });
      if ("refusal" in sim) return sim.refusal;
      let precomputed: NonNullable<DecideOptions["precomputed"]> = { input: null, refusal: null, evaluations: [] };
      if (sim.input) {
        const r = await core.ports.policy.refuse(core.activePolicy(), sim.input, { budget: core.ports.policy.actBudget(), recoveryKey: false });
        if (r.refusal) return r.refusal;
        precomputed = { input: sim.input, refusal: null, evaluations: r.evaluations };
      }
      const grantPlan = await decide(core, grant, "submitted", {}, { authority: sim.authority, precomputed });
      if (grantPlan.t !== "accept") return grantPlan.t === "replay" ? refusal("invalid-body", "The session grant was replayed.") : grantPlan.refusal;
      const bearer = `arb_${randomToken()}`;
      try {
        const out = core.sql.transaction(() => {
          if (core.headSeq() !== snap) throw new Moved();
          const late = finalBoundary(core, joinPlan);
          if (late) throw new Abort(late);
          const joined = commit(core, joinPlan, { heldKeys: [{ key: memberKey.key, seed: memberKey.seed, purpose: "member" }] });
          fault("redemption:after-join");
          const late2 = finalBoundary(core, grantPlan);
          if (late2) throw new Abort(late2);
          const granted = commit(core, grantPlan, { heldKeys: [{ key: sessionKey.key, seed: sessionKey.seed, purpose: "session" }] });
          fault("redemption:after-delegate");
          core.sql.all("INSERT INTO bearers (hash, member, key, delegation, expires_ms) VALUES (?, ?, ?, ?, ?)", tokenHash(bearer), (joined.result as RosterRecord).by.member, sessionKey.key, granted.id, expiresMs);
          return { joined: joined.result as RosterRecord, delegation: granted.id };
        });
        core.committed();
        const by = out.joined.by as Extract<RosterRecord["by"], { via: "join" }>;
        // R-CRED-3 step 3: the bearer token is returned once; only its hash is stored.
        return {
          custody: "room",
          member: by.member,
          role: by.role,
          key: memberKey.key,
          delegation: out.delegation,
          bearer,
          expiresAt: iso(expiresMs),
          mcp: `${mcpBase}/v1/rooms/${core.roomId}/mcp` as `https://${string}`,
        };
      } catch (e) {
        if (e instanceof Moved) continue;
        if (e instanceof Abort) return e.refusal;
        throw e;
      }
    }
    throw artroomError("unavailable", "The room is busy. Retry the redemption.", { retryAfterMs: 100, maybeRecorded: false });
  });
}

// ------------------------------------------------------------ bearer acts (R-CRED-3 step 4)

/** An act for an MCP agent: signed by the bearer's session key, naming its delegation. */
/**
 * Judge a bearer token (R-CRED-10): an unknown or expired token, or a
 * revoked delegation or session key, is `unauthenticated` and nothing is
 * recorded. So after revocation even a retry of an earlier act is refused:
 * there is no envelope to replay.
 */
function judgeBearer(core: RoomCore, bearer: unknown): { readonly key: KeyId; readonly delegation: DelegationId; readonly seed: Uint8Array } {
  const fail = () => artroomError("unauthenticated", "The bearer token is not valid.");
  if (typeof bearer !== "string") throw fail();
  const row = one(core.sql, "SELECT * FROM bearers WHERE hash = ?", tokenHash(bearer));
  if (!row || num(row, "expires_ms")! <= core.now()) throw fail();
  const key = str(row, "key") as KeyId;
  const d = delegation(core.sql, str(row, "delegation")!);
  if (!d || d.revoked !== undefined || d.expiresMs <= core.now() || revocationOf(core.sql, key)) throw fail();
  const seed = core.heldSeed(key);
  if (!seed) throw fail();
  return { key, delegation: d.id, seed };
}

/**
 * An act for an MCP agent: the room sets `v`, its room ID, the actor (the
 * session key) and the delegation, signs with the session key, and admits it
 * on the `submitted` path (R-CRED-3 step 4, R-CRED-10). The same act and
 * idempotency key build the same bytes, so a retry gets the original result.
 */
export async function bearerAct(core: RoomCore, bearer: unknown, act: unknown): Promise<ActRecord | Refusal> {
  const b = judgeBearer(core, bearer);
  if (!isPlainObject(act) || Object.keys(act).some((k) => !["kind", "target", "body", "idempotencyKey"].includes(k)))
    throw artroomError("bad-request", "A bearer act has only kind, target, body and idempotencyKey.");
  const a = act as Pick<Envelope, "kind" | "target" | "body" | "idempotencyKey">;
  const env = { v: 1, room: core.roomId, actor: b.key, kind: a.kind, target: a.target, body: a.body, idempotencyKey: a.idempotencyKey, delegation: b.delegation } as Envelope;
  return submit(core, { envelope: env, sig: sign(b.seed, "artroom-envelope-v1", env) }, "submitted");
}

/** `workspace` or `workspace-token` for a bearer session, judged under its delegation (R-CRED-10, R-WS-2). */
export async function bearerRequest(core: RoomCore, bearer: unknown, req: unknown): Promise<WorkspaceOp | WorkspaceGrant | Refusal> {
  const b = judgeBearer(core, bearer);
  const body = isPlainObject(req) ? req : {};
  if (
    (body["kind"] !== "workspace" && body["kind"] !== "workspace-token") ||
    Object.keys(body).some((k) => !["kind", "lane", "lease"].includes(k)) ||
    typeof body["lane"] !== "string" ||
    !RE.actId.test(body["lane"]) ||
    !Number.isSafeInteger(body["lease"])
  )
    throw artroomError("bad-request", "A bearer request is workspace or workspace-token, with lane and lease.");
  return workspaceRequest(core, b.key, b.delegation, body as never);
}
